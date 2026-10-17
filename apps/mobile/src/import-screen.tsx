import React, { useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, Text, View } from 'react-native';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { formatMoney, parseMoneyInput, type Command, type ImportedEvent, type Kind } from './domain';
// HTML pasted from an email becomes readable text; a too-long paste stays visible with its length error.
const pastedText = (text: string) => { try { return looksLikeHtml(text) ? messageToPlainText(text) : text; } catch { return text; } };
import { analyzeReceiptText, parseImportText, MAX_IMPORT_TEXT, messageToPlainText, looksLikeHtml } from './import';
import { isNativeImportAvailable, recognizeImportImage, sharedInboxStatus } from './native';
import { errorMessage, newId, useLedger } from './store';
import { useRecordId } from './forms';
import { useAppLock } from './app-lock';
import { Button, Card, Choice, Empty, Field, FormFooter, Page, localInput, parseLocalInput, styles, toggle, useDraft } from './ui';

const classifications = { payment_success: 'Thanh toán / chuyển cho người khác', pending_order: 'Đơn chờ / thanh toán chưa thành công', internal_transfer: 'Đề xuất chuyển giữa ví của bạn', refund: 'Hoàn tiền', balance_update: 'Thông báo số dư', ignored: 'Chưa nhận diện' };
const states = { received: 'Mới nhận', processing: 'Đang phân tích', needs_review: 'Chờ duyệt', imported: 'Đã ghi sổ', duplicate: 'Trùng mã nguồn / tham chiếu', failed: 'Phân tích lỗi' };
function status(event: ImportedEvent) { return event.ignored ? 'Đã bỏ qua' : states[event.state]; }

export function InboxScreen() {
  const store = useLedger(); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const [shareStatus, setShareStatus] = useState<{ available: boolean; error: string } | null>(null);
  useEffect(() => { let active = true; const refreshStatus = () => { void sharedInboxStatus().then(value => { if (active) setShareStatus(value); }); }; refreshStatus(); const subscription = AppState.addEventListener('change', state => { if (state === 'active') refreshStatus(); }); return () => { active = false; subscription.remove(); }; }, []);
  const events = [...store.ledger.importedEvents].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id));
  const refresh = async () => { setRefreshing(true); setError(''); try { setShareStatus(await sharedInboxStatus()); await store.retryNativeImports(); await store.refresh(); } catch (e) { setError(errorMessage(e)); } finally { setRefreshing(false); } };
  return <Page title="Chờ duyệt và lịch sử" back scroll={false}><FlatList data={events} keyExtractor={event => event.id} contentContainerStyle={styles.content} refreshing={refreshing} onRefresh={() => void refresh()} ListHeaderComponent={<><Text style={{ ...styles.helper, fontSize: 12, lineHeight: 18 }}>{shareStatus === null ? 'Đang kiểm tra chia sẻ…' : shareStatus.available ? 'Share và Shortcuts: nhận nội dung để kiểm tra, chưa ghi sổ.' : shareStatus.error}</Text><Text style={{ ...styles.helper, fontSize: 12, lineHeight: 18 }}>Nội dung ở trên thiết bị, không gửi cloud; xác nhận cuối mới ghi tiền.</Text><Text style={{ ...styles.helper, fontSize: 12, lineHeight: 18 }}>Nhận hết hàng chờ trước khi backup; nguồn chưa nhận chưa có trong JSON.</Text><Text style={{ ...styles.helper, fontSize: 12, lineHeight: 18 }}>{isNativeImportAvailable() ? 'Shortcuts nhận SMS/email bạn chọn; mở mục để duyệt.' : 'OCR và Shortcuts cần bản iOS riêng; Expo Go nhận văn bản dán.'}</Text>{store.nativeImportError && <Text accessibilityRole="alert" style={styles.error}>{store.nativeImportError}</Text>}{isNativeImportAvailable() && <Button title="Thử nhận lại Shortcuts / chia sẻ" secondary disabled={refreshing} onPress={() => void refresh()} />}<Button title="Dán nội dung mới" icon="add" onPress={() => router.push('/import-text')} />{error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</>} ListEmptyComponent={<Empty text="Chưa có nội dung. Dán thông báo hoặc mở mục đã lưu để phân tích và duyệt." />} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${status(item)}, ${item.provider}, ${item.amount ? formatMoney(item.amount) : 'Chưa có số tiền'}`} style={styles.card} onPress={() => router.push({ pathname: '/import-review', params: { id: item.id } })}><Text style={styles.heading}>{status(item)}</Text><Text style={styles.secondary}>{item.provider} · {localInput(item.receivedAt, store.ledger.settings.timezone)}</Text>{item.classification && <Text style={styles.text}>{classifications[item.classification]}</Text>}{item.amount && <Text style={styles.amount}>{formatMoney(item.amount)}</Text>}<Text numberOfLines={2} style={styles.secondary}>{item.text}</Text></Pressable>} /></Page>;
}

export function ImportTextScreen() {
  const { input } = useLocalSearchParams(); const focused = useIsFocused(); const lock = useAppLock();
  const store = useLedger(); const mounted = useRef(true); const generation = useRef(0); const lockNow = useRef(lock); lockNow.current = lock;
  const [foreground, setForeground] = useState(AppState.currentState === 'active'); const entryConsumed = useRef(false);
  const focusedNow = useRef(focused); focusedNow.current = focused;
  useEffect(() => { mounted.current = true; const subscription = AppState.addEventListener('change', state => { if (state === 'background') generation.current++; setForeground(state === 'active'); }); return () => { mounted.current = false; generation.current++; subscription.remove(); }; }, []);
  useEffect(() => { if (!focused || (lock.covered && AppState.currentState === 'active')) generation.current++; }, [focused, lock.covered]);
  const id = useRef(newId()); const receivedAt = useRef(new Date().toISOString());
  const [ocrBusy, setOcrBusy] = useState(false); const [ocrError, setOcrError] = useState(''); const [ocrWarnings, setOcrWarnings] = useState<string[]>([]); const ocrLocked = useRef(false);
  const draft = useDraft({ source: 'text', provider: 'Dán thủ công', sourceId: '', text: '', ocrText: '' }, undefined, ocrBusy); const value = (key: string) => String(draft.values[key]);
  const liveValues = useRef(draft.values); liveValues.current = draft.values;
  const draftBusy = useRef(draft.busy); draftBusy.current = draft.busy;
  const ocrSource = useRef<{ text: string; warnings: string[]; command: Command | null; loaded: Awaited<ReturnType<typeof store.execute>> | null } | null>(null);
  const [needsOcrRetry, setNeedsOcrRetry] = useState(false); const [reviewTarget, setReviewTarget] = useState<{ id: string; generation: number } | null>(null); const navigated = useRef(false);
  const current = (epoch: number) => {
    if (!mounted.current || generation.current !== epoch || !focusedNow.current || AppState.currentState !== 'active') return false;
    try { lockNow.current.assertUnlocked(); return true; } catch { return false; }
  };
  useEffect(() => {
    if (!reviewTarget || !draft.completed || draft.busy || ocrBusy || navigated.current || !current(reviewTarget.generation)) return;
    navigated.current = true; router.replace({ pathname: '/import-review', params: { id: reviewTarget.id } });
  }, [reviewTarget, draft.completed, draft.busy, ocrBusy, focused, foreground, lock.covered]);
  const saveOcr = async (epoch: number) => {
    const source = ocrSource.current; if (!source || !current(epoch)) return;
    await draft.save(mutationId => {
      if (!current(epoch)) throw new Error('Nhận diện bị gián đoạn. Bản nháp được giữ; thử phân tích lại khi mở khóa.');
      return source.command ?? { type: 'import.receive', mutationId, payload: { id: id.current, source: 'text', provider: 'Apple Vision', sourceId: null, text: source.text, receivedAt: receivedAt.current } };
    }, async result => {
      source.loaded = result; if (mounted.current) setNeedsOcrRetry(true);
      const event = result.ledger.importedEvents.find(item => item.id === id.current)!;
      if (!source.command) source.command = { type: 'import.reparse', mutationId: newId(), payload: { id: event.id, expectedVersion: event.version, text: source.text, warnings: source.warnings } };
      if (!current(epoch)) throw new Error('Nguồn đã nằm trong Inbox. Mở khóa rồi thử phân tích lại; chưa ghi tiền.');
      if (event.state === 'received' || event.state === 'failed' || event.state === 'processing') source.loaded = await store.execute(source.command, result.revision);
      if (!current(epoch)) throw new Error('Nguồn đã nằm trong Inbox. Mở khóa rồi mở lại để duyệt; chưa ghi tiền.');
      setReviewTarget({ id: event.id, generation: epoch });
    }, { navigateBack: false });
    if (mounted.current && source.loaded?.ledger.importedEvents.some(event => event.id === id.current && ['needs_review', 'duplicate'].includes(event.state))) await draft.reload();
  };
  const recognize = async (camera: boolean) => {
    if (ocrLocked.current || draftBusy.current) return;
    try {
      lock.assertUnlocked();
      if (!focusedNow.current || AppState.currentState !== 'active' || !isNativeImportAvailable()) return;
      ocrLocked.current = true; setOcrBusy(true); setOcrError('');
      const epoch = generation.current;
      const previousOcrText = value('ocrText');
      const result = await recognizeImportImage(camera);
      if (result && mounted.current && !current(epoch)) {
        if (!previousOcrText && String(liveValues.current.ocrText) === previousOcrText) { draft.set('ocrText', result.text); setOcrWarnings(result.warnings); }
        setOcrError('Nhận diện bị gián đoạn. Văn bản được giữ trong bản nháp; mở khóa, kiểm tra rồi chọn phân tích và duyệt. Chưa lưu nguồn hay ghi tiền.');
      }
      if (result && current(epoch)) {
        if (!result.text.trim()) { setOcrError('Không tìm thấy chữ trong ảnh. Chọn ảnh rõ hơn hoặc dán nội dung; bản nháp được giữ.'); }
        else {
          if (String(liveValues.current.ocrText) !== previousOcrText) { setOcrError('Văn bản đang sửa đã thay đổi. Bản nháp được giữ; kiểm tra rồi phân tích khi sẵn sàng.'); return; }
          draft.set('ocrText', result.text); setOcrWarnings(result.warnings);
          if (result.text.length <= MAX_IMPORT_TEXT && !String(liveValues.current.text).trim() && !ocrSource.current) {
            const suggestion = parseImportText(result.text);
            if (analyzeReceiptText(result.text) || ['payment_success', 'refund', 'internal_transfer'].includes(suggestion.classification)) {
              ocrSource.current = { text: result.text, warnings: result.warnings.map(warning => 'Nhận diện ảnh: ' + warning).slice(0, 20), command: null, loaded: null };
              setNeedsOcrRetry(true);
              await saveOcr(epoch);
            }
          }
        }
      }
    } catch (e) { if (mounted.current) setOcrError(errorMessage(e)); }
    finally { ocrLocked.current = false; if (mounted.current) setOcrBusy(false); }
  };
  const entry = input === 'camera' || input === 'photo' ? input : null;
  const clean = value('source') === 'text' && value('provider') === 'Dán thủ công' && !value('sourceId') && !value('text') && !value('ocrText');
  useEffect(() => {
    if (entryConsumed.current || !entry || !focused || !foreground || AppState.currentState !== 'active' || lock.covered || lock.busy || draft.busy || ocrBusy || !clean || !isNativeImportAvailable()) return;
    entryConsumed.current = true;
    void recognize(entry === 'camera');
  }, [entry, focused, foreground, lock.covered, lock.busy, draft.busy, ocrBusy, clean]);
  const canAnalyzeOcr = !!value('ocrText').trim() && value('ocrText').length <= MAX_IMPORT_TEXT && !!analyzeReceiptText(value('ocrText'));
  const continueOcrDraft = async () => {
    if (ocrLocked.current || draftBusy.current || ocrSource.current || !canAnalyzeOcr || !current(generation.current)) return;
    ocrSource.current = { text: value('ocrText'), warnings: ocrWarnings.map(warning => 'Nhận diện ảnh: ' + warning).slice(0, 20), command: null, loaded: null };
    setNeedsOcrRetry(true); await saveOcr(generation.current);
  };
  const ocr = <Card><Text style={styles.helper}>Chọn/chụp ảnh → kiểm tra đề xuất. Apple Vision đọc trên thiết bị, không gửi cloud. Xóa ảnh tạm, giữ ảnh Photos; xác nhận cuối mới ghi tiền.</Text>{isNativeImportAvailable() ? <><View style={styles.pair}><View style={styles.half}><Button title={ocrBusy ? 'Đang nhận diện…' : 'Chọn ảnh để nhận diện'} secondary disabled={ocrBusy || draft.busy || needsOcrRetry} onPress={() => void recognize(false)} /></View><View style={styles.half}><Button title="Chụp ảnh để nhận diện" secondary disabled={ocrBusy || draft.busy || needsOcrRetry} onPress={() => void recognize(true)} /></View></View></> : <Text style={styles.secondary}>Ảnh cần bản iOS riêng; Expo Go vẫn hỗ trợ dán văn bản.</Text>}{ocrError && <Text accessibilityRole="alert" style={styles.error}>{ocrError}</Text>}{value('ocrText') === '' && ocrWarnings.map(warning => <Text key={warning} style={styles.advisory}>{warning}</Text>)}{needsOcrRetry && <><Text style={styles.secondary}>{ocrSource.current?.loaded ? 'Nguồn đã được giữ trong Inbox, chưa ghi tiền. Thử phân tích lại để duyệt cùng nội dung.' : 'Văn bản đang được giữ trong bản nháp, chưa lưu vào Inbox hay ghi tiền. Thử lại để lưu nguồn và mở đề xuất.'}</Text><Button title="Thử lại phân tích và duyệt" disabled={ocrBusy || draft.busy} onPress={() => void saveOcr(generation.current)} /></>}{canAnalyzeOcr && !needsOcrRetry && <Button title="Phân tích và duyệt hóa đơn" disabled={ocrBusy || draft.busy} onPress={() => void continueOcrDraft()} />}{value('ocrText') !== '' && <><Field label="Văn bản từ ảnh — kiểm tra và sửa" multiline style={{ minHeight: 120 }} value={value('ocrText')} editable={!ocrBusy && !draft.busy && !needsOcrRetry} onChangeText={text => draft.set('ocrText', text)} /><Text accessibilityLiveRegion="polite" style={styles.secondary}>{value('ocrText').length}/{MAX_IMPORT_TEXT} ký tự</Text>{ocrWarnings.map(warning => <Text key={warning} style={styles.advisory}>{warning}</Text>)}{value('ocrText').length > MAX_IMPORT_TEXT && <Text accessibilityRole="alert" style={styles.error}>Ảnh có hơn 4.000 ký tự. Nội dung được giữ nguyên; hãy rút gọn trước khi dùng.</Text>}<Button title="Dùng văn bản đã kiểm tra" secondary disabled={ocrBusy || draft.busy || needsOcrRetry || !value('ocrText').trim() || value('ocrText').length > MAX_IMPORT_TEXT} onPress={() => { draft.set('text', value('ocrText')); draft.set('provider', 'Apple Vision'); draft.set('source', 'text'); draft.set('sourceId', ''); draft.set('ocrText', ''); }} /></>}</Card>;
  return <Page title={entry ? 'Nhận diện ảnh' : 'Dán nội dung'} back>{entry ? <>{ocr}{value('text') !== '' && <><Field label="Nội dung SMS / email / văn bản" multiline style={{ minHeight: 120 }} value={value('text')} onChangeText={text => draft.set('text', pastedText(text))} error={draft.errors.text} /><Text accessibilityLiveRegion="polite" style={styles.secondary}>{value('text').length}/{MAX_IMPORT_TEXT} ký tự</Text>{value('text').length > MAX_IMPORT_TEXT && <Text accessibilityRole="alert" style={styles.error}>Đã vượt giới hạn 4.000 ký tự. Hãy rút gọn trước khi lưu; bản dán được giữ nguyên.</Text>}<Button title={draft.busy ? 'Đang lưu…' : 'Lưu để duyệt'} disabled={draft.busy || ocrBusy || needsOcrRetry} onPress={() => void draft.save(mutationId => ({ type: 'import.receive', mutationId, payload: { id: id.current, source: value('source') as ImportedEvent['source'], provider: value('provider').trim(), sourceId: value('sourceId').trim() || null, text: value('text'), receivedAt: receivedAt.current } }))} /></>}<FormFooter draft={draft} /></> : <><Text style={styles.helper}>Dán tối đa 4.000 ký tự để duyệt. App không tự đọc SMS/email; xác nhận cuối mới ghi tiền.</Text><Field label="Nội dung SMS / email / văn bản" multiline style={{ minHeight: 120 }} value={value('text')} onChangeText={text => draft.set('text', pastedText(text))} error={draft.errors.text} /><Text accessibilityLiveRegion="polite" style={styles.secondary}>{value('text').length}/{MAX_IMPORT_TEXT} ký tự</Text>{value('text').length > MAX_IMPORT_TEXT && <Text accessibilityRole="alert" style={styles.error}>Đã vượt giới hạn 4.000 ký tự. Hãy rút gọn trước khi lưu; bản dán được giữ nguyên.</Text>}<FormFooter draft={draft} /><Button title={draft.busy ? 'Đang lưu…' : 'Lưu để duyệt'} disabled={draft.busy || ocrBusy || needsOcrRetry} onPress={() => void draft.save(mutationId => ({ type: 'import.receive', mutationId, payload: { id: id.current, source: value('source') as ImportedEvent['source'], provider: value('provider').trim(), sourceId: value('sourceId').trim() || null, text: value('text'), receivedAt: receivedAt.current } }))} /></>}</Page>;
}

export function ImportReviewScreen() {
  const store = useLedger(); const params = useRecordId(); const [ownReview, setOwnReview] = useState<{ version: number; values?: Record<string, unknown> }>({ version: 0 }); const event = store.ledger.importedEvents.find(e => e.id === params.id);
  return event && !params.invalid ? <Review key={`${event.id}:${ownReview.version}`} event={event} previousValues={ownReview.values} onReparsed={(version, values) => setOwnReview({ version, values })} /> : <Page title="Duyệt nội dung" back><Empty text="Không tìm thấy nội dung. Quay lại và tải lại Inbox." /></Page>;
}
function Review({ event: incoming, previousValues, onReparsed }: { event: ImportedEvent; previousValues?: Record<string, unknown>; onReparsed: (version: number, values: Record<string, unknown>) => void }) {
  const event = useRef(incoming).current;
  const { ledger } = useLedger(); const timezone = ledger.settings.timezone; const wallets = ledger.wallets.filter(w => !w.archived); const id = useRef(newId());
  const initialKind = event.kind ?? 'expense';
  const draft = useDraft({ mode: event.classification === 'internal_transfer' ? 'transfer' : 'transaction', kind: initialKind, walletId: wallets[0]?.id ?? '', fromWalletId: wallets[0]?.id ?? '', toWalletId: wallets[1]?.id ?? '', categoryId: ledger.categories.find(c => c.kind === initialKind && !c.archived)?.id ?? '', occurredAt: localInput(event.receivedAt, timezone), note: '', tagIds: [], ...previousValues, originalText: event.text, amount: event.amount ?? '' }, { table: 'importedEvents', row: event });
  const liveValues = useRef(draft.values); liveValues.current = draft.values; const busyNow = useRef(draft.busy); busyNow.current = draft.busy;
  const value = (key: string) => String(draft.values[key]); const tags = draft.values.tagIds as string[];
  const canReview = !event.ignored && event.state === 'needs_review' && ['payment_success', 'refund', 'internal_transfer'].includes(event.classification ?? '');
  const canProcess = !event.ignored && ['received', 'processing', 'failed'].includes(event.state);
  const canIgnore = !event.ignored && !['imported', 'duplicate'].includes(event.state);
  const receipt = analyzeReceiptText(event.text);
  const receiptFlow = !!receipt && canReview;
  const [step, setStep] = useState(1);
  const receiptAdvanceError = (values: Record<string, unknown>) => {
    if (String(values.originalText) !== event.text) return 'Văn bản gốc đã sửa. Phân tích lại trước khi tiếp tục.';
    try {
      if (BigInt(parseMoneyInput(String(values.amount))) <= 0n) return 'Số tiền phải lớn hơn 0.';
      return '';
    } catch (error) { return errorMessage(error); }
  };
  const nextError = receiptFlow ? receiptAdvanceError(draft.values) : '';
  return <Page key={receiptFlow ? step : 'review'} title={receiptFlow ? step === 1 ? 'Kiểm tra hóa đơn' : 'Thông tin giao dịch' : 'Duyệt nội dung'} back>{receiptFlow && <Text accessibilityLiveRegion="polite" style={styles.secondary}>Bước {step}/2</Text>}<Card><Text style={styles.heading}>{status(event)}</Text><Text style={styles.secondary}>{event.source} · {event.provider} · {localInput(event.receivedAt, timezone)}</Text>{!receiptFlow && <Text selectable style={styles.text}>{event.text}</Text>}{event.classification && !receiptFlow && <Text style={styles.text}>{receipt ? 'Đề xuất từ hóa đơn — chưa xác nhận thanh toán' : classifications[event.classification]}</Text>}{event.reference && <Text style={styles.secondary}>Mã tham chiếu: {event.reference}</Text>}{event.sourceId && <Text style={styles.secondary}>ID nguồn: {event.sourceId}</Text>}{!canIgnore && event.warnings.map((warning, index) => <Text key={index} style={styles.advisory}>{warning}</Text>)}{event.error && <Text accessibilityRole="alert" style={styles.error}>{event.error}</Text>}{event.state === 'duplicate' && <Text style={styles.secondary}>Đã có nguồn cùng mã. Nội dung được giữ để đối chiếu và không ghi thêm.</Text>}{event.state === 'imported' && <Text style={styles.secondary}>{event.transactionId || event.transferId ? 'Lần ghi sổ đã được liên kết.' : 'Lần ghi sổ liên quan đã bị xóa; nguồn vẫn giữ để chống nhập trùng.'}</Text>}</Card>{canIgnore && (!receiptFlow || step === 1) && <><Field label="Văn bản gốc — kiểm tra và sửa" multiline style={{ minHeight: 120 }} value={value('originalText')} editable={!draft.busy} onChangeText={text => { if (!busyNow.current) draft.set('originalText', text); }} /><Text accessibilityLiveRegion="polite" style={styles.secondary}>{value('originalText').length}/{MAX_IMPORT_TEXT} ký tự</Text>{event.warnings.map((warning, index) => <Text key={index} style={styles.advisory}>{warning}</Text>)}<Button title="Phân tích lại văn bản" disabled={draft.busy || !value('originalText').trim() || value('originalText').length > MAX_IMPORT_TEXT} onPress={() => void draft.save(mutationId => ({ type: 'import.reparse', mutationId, payload: { id: event.id, expectedVersion: event.version, text: value('originalText'), warnings: event.warnings.filter(warning => warning.startsWith('Nhận diện ảnh: ')) } }), async result => { onReparsed(result.ledger.importedEvents.find(item => item.id === event.id)!.version, liveValues.current); }, { navigateBack: false })} /></>}{receipt && (!receiptFlow || step === 1) && <Card><Text style={styles.heading}>Tổng trên hóa đơn</Text>{receipt.evidence && <Text selectable style={styles.text}>{receipt.evidence}</Text>}{receipt.candidates.length > 0 && <Choice label="Số tiền trên hóa đơn" items={[...new Set(receipt.candidates.map(candidate => candidate.amount))].map(amount => ({ id: amount, name: `${formatMoney(amount)} · ${receipt.candidates.find(candidate => candidate.amount === amount)!.evidence}` }))} selected={value('amount') ? [value('amount')] : []} onSelect={amount => draft.set('amount', amount)} />}<Text style={styles.helper}>Chọn tổng đã kiểm tra hoặc nhập bên dưới.</Text></Card>}{receiptFlow && step === 1 && <><Field label="Số tiền VND" style={styles.reviewAmountInput} keyboardType="number-pad" value={value('amount')} onChangeText={text => draft.set('amount', text)} error={draft.errors.amount} />{nextError && <Text accessibilityRole="alert" style={styles.error}>{nextError}</Text>}<Button title="Tiếp tục: thông tin giao dịch" disabled={draft.busy || !!nextError} onPress={() => { if (!busyNow.current && !receiptAdvanceError(liveValues.current)) setStep(2); }} /></>}{canProcess && <><Text style={styles.helper}>Phân tích xong: mở lại mục Chờ duyệt trên Giao dịch.</Text><Button title={draft.busy ? 'Đang phân tích…' : 'Phân tích nội dung'} disabled={draft.busy} onPress={() => void draft.save(mutationId => ({ type: 'import.process', mutationId, payload: { id: event.id, expectedVersion: event.version } }))} /></>}{canReview && (!receiptFlow || step === 2) && <>{receiptFlow && <><View style={[styles.card, styles.confirmation]}><Text style={styles.secondary}>Số tiền cần xác nhận</Text><Text style={styles.confirmationAmount}>{formatMoney(parseMoneyInput(value('amount')))}</Text><Text style={styles.advisory}>Hóa đơn chưa chứng minh đã thanh toán; chỉ xác nhận giao dịch thực tế.</Text></View><Button title="Quay lại: kiểm tra hóa đơn" secondary disabled={draft.busy} onPress={() => { if (!busyNow.current) setStep(1); }} /></>}<Text style={styles.helper}>Kiểm tra tiền, ví và loại trước khi xác nhận. Thời gian mặc định lúc nhận, chưa đọc từ nội dung.</Text><View style={styles.pair}><View style={styles.half}><Choice dropdown label="Ghi sổ dưới dạng" items={event.classification === 'refund' ? [{ id: 'transaction', name: 'Thu hoàn tiền' }] : [{ id: 'transaction', name: 'Thu / chi' }, { id: 'transfer', name: 'Chuyển giữa ví của bạn' }]} selected={[value('mode')]} onSelect={key => draft.set('mode', key)} /></View>{value('mode') === 'transfer' ? null : <View style={styles.half}><Choice dropdown label="Loại" items={event.classification === 'refund' ? [{ id: 'income', name: 'Thu' }] : [{ id: 'expense', name: 'Chi' }, { id: 'income', name: 'Thu' }]} selected={[value('kind')]} onSelect={key => { draft.set('kind', key); draft.set('categoryId', ledger.categories.find(c => c.kind === key && !c.archived)?.id ?? ''); }} /></View>}</View>{!receiptFlow && <Field label="Số tiền VND" style={styles.reviewAmountInput} keyboardType="number-pad" value={value('amount')} onChangeText={text => draft.set('amount', text)} error={draft.errors.amount} />}{value('mode') === 'transfer' ? <><Text style={styles.helper}>Hai ví phải thuộc bạn; chuyển cho người khác chọn Chi.</Text><View style={styles.pair}><View style={styles.half}><Choice dropdown label="Từ ví của bạn" items={wallets} selected={[value('fromWalletId')]} onSelect={key => draft.set('fromWalletId', key)} /></View><View style={styles.half}><Choice dropdown label="Đến ví của bạn" items={wallets} selected={[value('toWalletId')]} onSelect={key => draft.set('toWalletId', key)} /></View></View></> : <><View style={styles.pair}><View style={styles.half}><Choice dropdown label="Ví" items={wallets} selected={[value('walletId')]} onSelect={key => draft.set('walletId', key)} /></View><View style={styles.half}><Choice dropdown label="Danh mục" items={ledger.categories.filter(c => c.kind === value('kind') && !c.archived)} selected={[value('categoryId')]} onSelect={key => draft.set('categoryId', key)} /></View></View><Choice dropdown label="Nhãn (chọn nhiều)" multiple items={ledger.tags.filter(t => !t.archived)} selected={tags} onSelect={key => draft.set('tagIds', toggle(tags, key))} /></>}<Field label="Ghi chú" multiline value={value('note')} onChangeText={text => draft.set('note', text)} /><Button title="Quản lý danh mục và nhãn" secondary disabled={draft.busy} onPress={() => router.push('/catalog')} /><Button title={draft.busy ? 'Đang ghi sổ…' : 'Xác nhận ghi sổ'} disabled={draft.busy || value('originalText') !== event.text} onPress={() => void draft.save(mutationId => {
    if (value('originalText') !== event.text) throw new Error('Văn bản gốc đã sửa. Phân tích lại trước khi xác nhận ghi sổ.');
    const common = { id: id.current, amount: parseMoneyInput(value('amount')), occurredAt: parseLocalInput(value('occurredAt'), timezone), note: value('note') };
    return { type: 'import.confirm', mutationId, payload: { id: event.id, expectedVersion: event.version, entry: value('mode') === 'transfer' ? { type: 'transfer', payload: { ...common, fromWalletId: value('fromWalletId'), toWalletId: value('toWalletId') } } : { type: 'transaction', payload: { ...common, kind: value('kind') as Kind, walletId: value('walletId'), categoryId: value('categoryId'), tagIds: tags } } } };
  })} /></>}{!canReview && event.state === 'needs_review' && !event.ignored && <Text style={styles.helper}>Đơn chờ/số dư/nội dung chưa rõ không tạo thu chi. Bỏ qua để giữ lịch sử; giao dịch thực tế thêm từ tab Giao dịch.</Text>}<FormFooter draft={draft} />{canIgnore && <><Text style={styles.helper}>Bỏ qua giữ nguồn trong Inbox; nguồn trùng chưa ghi sổ có thể được mở lại để duyệt.</Text><Button title="Bỏ qua, giữ lịch sử" secondary disabled={draft.busy} onPress={() => void draft.save(mutationId => ({ type: 'import.ignore', mutationId, payload: { id: event.id, expectedVersion: event.version } }))} /></>}</Page>;
}
