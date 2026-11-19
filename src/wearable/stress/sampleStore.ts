import { Directory, File, Paths } from 'expo-file-system';
import { HeartRateEvent } from '../WearBridge';

/**
 * Armazenamento local das amostras brutas do relógio.
 *
 * Formato: NDJSON append-only (uma amostra JSON por linha), um arquivo por dia.
 *
 * Por que arquivo e não banco: a carga aqui é escrita a 1 Hz, leitura
 * praticamente nunca, e o consumo final é o pipeline de pesquisa offline em
 * Python — que quer um arquivo, não um banco. Não há uma única consulta SQL no
 * caso de uso, então SQLite seria complexidade (e uma dependência nativa nova
 * num repositório de terceiro) sem contrapartida. Como bônus, o formato de
 * armazenamento *é* o formato de exportação: não existe passo de conversão que
 * possa divergir do dado gravado.
 *
 * Amostras com `motionFlag` também são gravadas. O flag serve para excluir a
 * janela do índice, não para apagar o dado — descartar em disco tornaria o
 * conjunto inauditável.
 */

const DIR_NAME = 'biometrics';

/** Amostras acumuladas antes de tocar o disco. A 1 Hz, isso é uma escrita a cada ~15 s. */
const FLUSH_EVERY = 15;

let buffer: HeartRateEvent[] = [];
/** Serializa as escritas: sem isso dois flushes concorrentes se intercalariam no mesmo offset. */
let writeChain: Promise<void> = Promise.resolve();

function directory(): Directory {
  const dir = new Directory(Paths.document, DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function fileNameFor(timestamp: number): string {
  // Data local, não UTC: uma sessão de coleta não deve ser partida ao meio
  // porque cruzou a meia-noite de Greenwich.
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `biometrics-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.ndjson`;
}

/**
 * Codifica em UTF-8. O conteúdo é JSON de chaves ASCII e valores numéricos,
 * portanto puro ASCII — o caminho manual é exato, não uma aproximação, e evita
 * depender de `TextEncoder` estar presente no runtime.
 */
function toBytes(text: string): Uint8Array {
  const g = globalThis as { TextEncoder?: new () => { encode(s: string): Uint8Array } };
  if (typeof g.TextEncoder === 'function') return new g.TextEncoder().encode(text);

  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0x7f;
  return bytes;
}

function appendLines(file: File, text: string): void {
  if (!file.exists) file.create({ intermediates: true, overwrite: false });

  const handle = file.open();
  try {
    // Append de verdade: posiciona no fim antes de escrever. `File.write()`
    // sozinho truncaria o arquivo a cada flush.
    handle.offset = handle.size ?? 0;
    handle.writeBytes(toBytes(text));
  } finally {
    handle.close();
  }
}

/** Enfileira uma amostra. A escrita em disco acontece a cada [FLUSH_EVERY] amostras. */
export function recordSample(sample: HeartRateEvent): void {
  buffer.push(sample);
  if (buffer.length >= FLUSH_EVERY) void flushSamples();
}

/** Escreve o que estiver no buffer. Chamar ao encerrar a sessão/desmontar a tela. */
export function flushSamples(): Promise<void> {
  if (buffer.length === 0) return writeChain;

  const pending = buffer;
  buffer = [];

  writeChain = writeChain
    .then(() => {
      // Um flush pode cruzar a meia-noite, então agrupa por arquivo de destino.
      const byFile = new Map<string, string[]>();
      for (const sample of pending) {
        const name = fileNameFor(sample.timestamp);
        const lines = byFile.get(name);
        if (lines) lines.push(JSON.stringify(sample));
        else byFile.set(name, [JSON.stringify(sample)]);
      }

      const dir = directory();
      for (const [name, lines] of byFile) {
        appendLines(new File(dir, name), lines.join('\n') + '\n');
      }
    })
    .catch(error => {
      // Perder amostras é ruim, mas derrubar o stream de biometria é pior:
      // a tela ao vivo continua funcionando mesmo se o disco falhar.
      console.warn('[stress] falha ao gravar amostras', error);
    });

  return writeChain;
}

/** Arquivos de sessão gravados, mais recentes primeiro. */
export function listSessionFiles(): File[] {
  const dir = directory();
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.uri.endsWith('.ndjson'))
    .sort((a, b) => b.uri.localeCompare(a.uri));
}

/** Soma em bytes de tudo que está gravado — para mostrar na UI antes de exportar. */
export function storedBytes(): number {
  return listSessionFiles().reduce((total, file) => total + file.size, 0);
}
