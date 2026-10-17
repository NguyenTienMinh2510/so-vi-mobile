import { requireOptionalNativeModule } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AppState, Platform } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { parseAiPreferences, type MealOption, type Preferences } from './spending';
import type { LlamaContext } from 'llama.rn';
import { parseThinkingResult, buildLlamaInit, buildThinkingMessages, buildThinkingCompletion, buildFastPrompt, buildFastCompletion, thinkingAttemptMs, THINKING_INCOMPLETE, THINKING_LIMITS, type ThinkingRequest, type ThinkingResult } from './spending-thinking';
export type { ThinkingRequest, ThinkingResult };

export const SPENDING_MODEL = {
  name: 'Qwen3.5-4B Q5_K_M', repository: 'bartowski/Qwen_Qwen3.5-4B-GGUF', revision: '4168f45a16a1290d65a4ec0fa312ae917a4c15d6',
  filename: 'Qwen_Qwen3.5-4B-Q5_K_M.gguf', bytes: 3443763168, sha256: '21c4643259ce62ffd979848e5819ce03823fd9e9902279ab54cc0d572d83d33e', license: 'Apache-2.0', runtime: 'llama.rn 0.13.0-rc.7 (MIT)',
  url: 'https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/4168f45a16a1290d65a4ec0fa312ae917a4c15d6/Qwen_Qwen3.5-4B-Q5_K_M.gguf',
} as const;
export type AiState = { phase: 'missing' | 'checking' | 'downloading' | 'importing' | 'ready' | 'loading' | 'inferring' | 'thinking' | 'stopping' | 'error'; progress: number; error: string };
const verifier = requireOptionalNativeModule<{ verifyModelAsync: (uri: string) => Promise<boolean>; prepareModelDirectoryAsync?: () => Promise<string>; promoteModelAsync?: () => Promise<void> }>('SoViNative');
export const spendingAiAvailable = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && !!verifier?.verifyModelAsync;
function unavailable(): never { throw new Error('AI local cần bản Sổ Ví riêng trên iPhone; Expo Go dùng lựa chọn trực tiếp và bộ lập kế hoạch.'); }

// One owner across screen mounts; every canceled operation settles before the next starts.
class SpendingAi {
  state: AiState = { phase: 'missing', progress: 0, error: '' };
  private listeners = new Set<(state: AiState) => void>();
  private active: Promise<unknown> | null = null;
  private download: FS.DownloadResumable | null = null;
  private context: LlamaContext | null = null;
  private generation = 0;
  private cleanupError = '';
  private stopRequest: Promise<void> | null = null;
  private ready = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private releaseRequest: Promise<void> | null = null;
  constructor() { AppState.addEventListener('change', state => { if (state !== 'active') void this.cancel(); }); }
  thinkingDeadline() { return Date.now() + THINKING_LIMITS.totalMs; }
  private clearIdle() { if (this.idleTimer !== null) clearTimeout(this.idleTimer); this.idleTimer = null; }
  private releaseContext(message = 'Chưa giải phóng được AI. Đóng và mở lại ứng dụng trước khi dùng hoặc xóa mô hình.') {
    if (this.releaseRequest) return this.releaseRequest;
    const context = this.context;
    if (!context || this.cleanupError) return Promise.resolve();
    this.releaseRequest = (async () => {
      try { await context.release(); this.context = null; }
      catch { this.cleanupError = message; this.update({ phase: 'error', error: this.cleanupError }); }
    })();
    return this.releaseRequest.finally(() => { this.releaseRequest = null; });
  }
  private scheduleIdle() {
    if (!this.context || this.stopRequest || this.cleanupError) return;
    const generation = this.generation;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (generation === this.generation && !this.active && !this.stopRequest) void this.releaseContext();
    }, 30000);
  }
  private async loadContext(generation: number) {
    if (!this.context) {
      this.ready = false; await this.verify(this.model()); this.check(generation); this.ready = true;
      const runtime = await import('llama.rn'); this.check(generation);
      // shortcut: conservative A14 context, raise only after real iPhone RAM/thermal measurements.
      this.context = await runtime.initLlama(buildLlamaInit(this.model()));
    }
    this.check(generation);
    return this.context;
  }
  private root() { if (!FS.documentDirectory) unavailable(); return `${FS.documentDirectory}SoViAI/`; }
  private model() { return `${this.root()}model.gguf`; }
  private temp() { return `${this.root()}model.part`; }
  private async prepare() { if (verifier?.prepareModelDirectoryAsync) await verifier.prepareModelDirectoryAsync(); }
  private async verify(uri: string) { if (await verifier!.verifyModelAsync(uri) !== true) throw new Error('File mô hình chưa được xác minh. Nhập đúng file hoặc tải lại.'); }
  subscribe(listener: (state: AiState) => void) { this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); }; }
  private update(patch: Partial<AiState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(this.state); }
  private check(generation: number) { if (generation !== this.generation || AppState.currentState !== 'active') throw new Error('Đã hủy AI. Bản nháp được giữ.'); }
  private run<T>(phase: AiState['phase'], operation: (generation: number) => Promise<T>): Promise<T> {
    if (!spendingAiAvailable) return Promise.reject(new Error('AI local cần bản Sổ Ví riêng trên iPhone. Chọn sở thích trực tiếp để tiếp tục.'));
    if (this.active || this.stopRequest) return Promise.reject(new Error('Chờ AI hoàn tất hoặc hủy thao tác hiện tại.'));
    if (this.cleanupError) return Promise.reject(new Error(this.cleanupError));
    this.clearIdle();
    const generation = ++this.generation; this.update({ phase, progress: 0, error: '' });
    const keepAwake = ['loading', 'thinking', 'inferring'].includes(phase);
    const task = (async () => {
      try {
        if (keepAwake) { try { await activateKeepAwakeAsync('spending-ai'); } catch { /* Screen wake is best effort. */ } }
        await this.releaseRequest;
        if (this.cleanupError) throw new Error(this.cleanupError);
        this.check(generation); const result = await operation(generation); this.check(generation); return result;
      }
      catch (error) { if (generation === this.generation) this.update({ phase: 'error', error: this.cleanupError || (error instanceof Error ? error.message : 'AI chưa sẵn sàng. Chọn trực tiếp để tiếp tục.') }); throw error; }
      finally {
        this.download = null;
        if (keepAwake) { try { await deactivateKeepAwake('spending-ai'); } catch { /* Screen wake is best effort. */ } }
      }
    })();
    this.active = task;
    const settled = () => { if (this.active === task) { this.active = null; this.scheduleIdle(); } };
    void task.then(() => { settled(); if (!this.cleanupError && generation === this.generation) this.update({ phase: this.ready ? 'ready' : 'missing' }); }, settled);
    return task;
  }
  async cancel(): Promise<void> {
    if (this.stopRequest) return this.stopRequest;
    this.clearIdle(); ++this.generation; this.update({ phase: 'stopping' });
    const operation = this.active;
    this.stopRequest = (async () => {
      try { if (this.download) await this.download.cancelAsync(); if (operation && this.context && !this.releaseRequest) await this.context.stopCompletion(); }
      catch { this.cleanupError = 'Chưa dừng được AI. Đóng và mở lại ứng dụng trước khi tiếp tục.'; }
      if (operation) { try { await operation; } catch { /* Canceled results never reach the preference preview. */ } }
      await this.releaseContext('Chưa giải phóng được AI. Đóng và mở lại ứng dụng trước khi tiếp tục.');
      this.update({ phase: this.cleanupError ? 'error' : this.ready ? 'ready' : 'missing', error: this.cleanupError });
    })();
    try { await this.stopRequest; } finally { this.stopRequest = null; }
  }
  private async checkSaved(generation: number) {
    this.ready = false; this.update({ phase: 'checking' }); await this.prepare(); this.check(generation);
    const info = await FS.getInfoAsync(this.model()); this.check(generation);
    if (info.exists && (info.size === undefined || info.size === SPENDING_MODEL.bytes)) { await this.verify(this.model()); this.check(generation); this.ready = true; return true; }
    const candidate = await FS.getInfoAsync(this.temp()); this.check(generation);
    if (candidate.exists && candidate.size === SPENDING_MODEL.bytes) { await this.promote(generation); return true; }
    if (info.exists) { await this.verify(this.model()); this.check(generation); this.ready = true; return true; }
    return false;
  }
  checkModel() { return this.run('checking', generation => this.checkSaved(generation)); }
  private async discardIncomplete() { const info = await FS.getInfoAsync(this.temp()); if (info.exists && info.size !== undefined && info.size !== SPENDING_MODEL.bytes) await FS.deleteAsync(this.temp(), { idempotent: true }); }
  private async disk() { if (await FS.getFreeDiskStorageAsync() < SPENDING_MODEL.bytes + 256 * 1024 * 1024) throw new Error('Không đủ chỗ trống. Cần khoảng 3,8 GB để lưu mô hình; giữ nguyên sổ và bản nháp.'); await this.prepare(); await FS.makeDirectoryAsync(this.root(), { intermediates: true }); }
  private async promote(generation: number) { this.update({ phase: 'checking' }); await this.verify(this.temp()); this.check(generation); if (!verifier!.promoteModelAsync) throw new Error('Bản ứng dụng chưa hỗ trợ thay mô hình an toàn. Cập nhật Sổ Ví trước khi tải lại.'); await verifier!.promoteModelAsync(); this.check(generation); this.ready = true; }
  downloadModel() { return this.run('downloading', async generation => { if (await this.checkSaved(generation)) return; this.check(generation); await this.disk(); this.check(generation); this.update({ phase: 'downloading' }); await FS.deleteAsync(this.temp(), { idempotent: true }); this.check(generation); this.download = FS.createDownloadResumable(SPENDING_MODEL.url, this.temp(), {}, value => { if (generation === this.generation) this.update({ progress: Math.min(1, value.totalBytesWritten / SPENDING_MODEL.bytes) }); }); try { const response = await this.download.downloadAsync(); this.check(generation); if (!response || response.status !== 200) throw new Error('Tải mô hình chưa hoàn tất. Thử lại khi có mạng hoặc nhập file.'); await this.promote(generation); } finally { await this.discardIncomplete(); } }); }
  importModel() { return this.run('importing', async generation => { const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false, multiple: false }); this.check(generation); if (result.canceled) return; const file = result.assets[0]; if (!file || !file.uri.startsWith('file://') || (file.size !== undefined && file.size !== SPENDING_MODEL.bytes)) throw new Error('Chọn đúng file Qwen3.5-4B Q5_K_M 3.443.763.168 byte.'); await this.disk(); this.check(generation); this.ready = false; await FS.deleteAsync(this.temp(), { idempotent: true }); try { await FS.copyAsync({ from: file.uri, to: this.temp() }); this.check(generation); await this.promote(generation); } finally { await this.discardIncomplete(); } }); }
  async deleteModel() { await this.cancel(); return this.run('checking', async generation => { this.ready = false; await this.prepare(); this.check(generation); await FS.deleteAsync(this.model(), { idempotent: true }); await FS.deleteAsync(this.temp(), { idempotent: true }); this.check(generation); }); }
  think(request: ThinkingRequest, catalog: MealOption[], deadline = this.thinkingDeadline()): Promise<ThinkingResult> {
    return this.run('loading', async generation => {
      const attemptMs = thinkingAttemptMs(deadline, Date.now()), attemptDeadline = Math.min(deadline, Date.now() + attemptMs);
      let timedOut = false, stopping: Promise<void> | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        stopping = this.context?.stopCompletion().catch(() => { this.cleanupError = 'Chưa dừng được AI. Đóng và mở lại ứng dụng trước khi tiếp tục.'; });
      }, attemptMs);
      const checkBudget = () => { this.check(generation); if (timedOut || Date.now() >= attemptDeadline) throw new Error(THINKING_INCOMPLETE); };
      try {
        const messages = buildThinkingMessages(request, catalog); checkBudget();
        const context = await this.loadContext(generation); checkBudget();
        const tokenized = await context.tokenize(messages.map(m => m.content).join('\n')); checkBudget();
        if (tokenized.tokens.length > THINKING_LIMITS.prompt) throw new Error('Mô tả và thực đơn quá dài cho AI suy nghĩ. Rút gọn mô tả hoặc dùng chế độ nhanh.');
        this.update({ phase: 'thinking' }); checkBudget();
        const output = await context.completion(buildThinkingCompletion(messages)); checkBudget();
        if (output.interrupted || output.truncated || output.stopped_limit || output.context_full) throw new Error(`${THINKING_INCOMPLETE} Bản nháp được giữ; thử lại, rút gọn mô tả hoặc dùng chế độ nhanh.`);
        const raw = output.content === undefined ? output.text : output.content;
        return parseThinkingResult(raw, catalog, request.cooking, output.reasoning_content ?? (output.text.match(/<think>([\s\S]*?)<\/think>/)?.[1] ?? ''));
      } catch (error) { checkBudget(); throw error; } finally { clearTimeout(timer); await stopping; }
    });
  }
  infer(text: string, catalog: MealOption[], venueContext: { id: string; name: string; evidence: 'unverified_candidate' }[] = [], dishAliases: string[][] = []): Promise<Preferences> {
    return this.run('loading', async generation => {
      const timer = setTimeout(() => { void this.cancel(); }, 60000);
      try {
        const prompt = buildFastPrompt(text, catalog, venueContext, dishAliases);
        const context = await this.loadContext(generation);
        const tokenized = await context.tokenize(prompt.messages.map(m => m.content).join('\n')); this.check(generation);
        if (tokenized.tokens.length > 1300) throw new Error('Thực đơn và sở thích quá dài cho AI. Giảm số món hoặc chọn sở thích trực tiếp.');
        this.update({ phase: 'inferring' }); this.check(generation); const output = await context.completion(buildFastCompletion(prompt)); this.check(generation);
        if (output.interrupted || output.truncated || output.stopped_limit || output.context_full) throw new Error('AI chưa hoàn tất câu trả lời. Bản nháp được giữ; thử lại với mô tả ngắn hơn.');
        return parseAiPreferences(output.content === undefined ? output.text : output.content, catalog);
      } finally { clearTimeout(timer); }
    });
  }
}
export const spendingAi = new SpendingAi();
