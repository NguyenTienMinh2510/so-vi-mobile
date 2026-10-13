import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { formatMoney, localDateKey, parseMoneyInput } from './domain';
import { errorMessage, newId, useLedger } from './store';
import { useAppLock } from './app-lock';
import { Button, Card, Choice, Icon, Page, colors, styles, toggle } from './ui';
import { planSpending, protectedSlot, replaceMeal, spendingTotals, validatePlanSave, type MealOption, type MealSlot, type PlanConfig, type Preferences, type SpendingPlan } from './spending';
import { SPENDING_MODEL, spendingAi, spendingAiAvailable, type AiState } from './spending-ai';
import { loadOnlineMeals } from './spending-sources';
import { assertRoadmapFoodSafety, normalizeRoadmapText, parseRoadmapPrompt, reviewRoadmapPreferences, roadmapAiCatalog, roadmapAiAliases, restoreRoadmapAiPreferences } from './spending-roadmap';
import { Field } from './ui';

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const emptyPreferences = (): Preferences => ({ likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] });
type Draft = { plan: SpendingPlan; catalog: MealOption[]; revision: number; expectedVersion: number | null; mode: 'ai' | 'math' | 'saved'; warnings: string[]; text: string };
const foodSymbol = (name: string) => /cơm/i.test(name) ? '🍚' : /gà/i.test(name) ? '🍗' : /bún|phở|hủ tiếu|mì/i.test(name) ? '🍜' : '🍽️';
const keyOf = (slot: MealSlot) => `${slot.day}/${slot.index}`;

export function RoadmapScreen() {
  const store = useLedger(), lock = useAppLock(), navigation = useNavigation();
  const latest = useRef({ store, lock }); latest.current = { store, lock };
  const today = localDateKey(new Date().toISOString(), store.ledger.settings.timezone);
  const [text, setText] = useState(''); const textRef = useRef(text); textRef.current = text;
  const [draft, setDraft] = useState<Draft | null>(null); const draftRef = useRef(draft); draftRef.current = draft;
  const [promptOpen, setPromptOpen] = useState(true), [help, setHelp] = useState(false), [advanced, setAdvanced] = useState(false), [modelOpen, setModelOpen] = useState(false), [conditions, setConditions] = useState(false), [budgetOpen, setBudgetOpen] = useState(false);
  const [scope, setScope] = useState<{ walletIds: string[]; categoryIds: string[]; fixed: PlanConfig['fixed'] }>({ walletIds: [], categoryIds: [], fixed: [] });
  const [view, setView] = useState('day'), [selectedDay, setSelectedDay] = useState(''), [week, setWeek] = useState(0), [detail, setDetail] = useState(''), [swap, setSwap] = useState('');
  const [ai, setAi] = useState<AiState>(spendingAi.state), [busy, setBusy] = useState(''), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
  const mounted = useRef(true), generation = useRef(0), active = useRef(false), controller = useRef<AbortController | null>(null);
  const pinned = useRef<string | null>(null);
  const aiBusy = !['ready', 'missing', 'error'].includes(ai.phase);
  const aiPhase = ({ missing: 'Chưa có mô hình', checking: 'Đang xác minh', downloading: 'Đang tải', importing: 'Đang nhập', ready: 'Sẵn sàng', loading: 'Đang nạp AI', inferring: 'Đang hiểu sở thích', stopping: 'Đang dừng', error: 'Chưa sẵn sàng' })[ai.phase];
  const cancel = () => { generation.current++; controller.current?.abort(); void spendingAi.cancel(); };
  const edit = () => { try { latest.current.lock.assertUnlocked(); if (latest.current.lock.locked || latest.current.lock.covered || AppState.currentState !== 'active') throw new Error('Mở khóa ứng dụng trước khi sửa.'); } catch (e) { setError(errorMessage(e)); return false; } cancel(); setDirty(true); setError(''); return true; };
  const updateDraft = (next: Draft) => { draftRef.current = next; setDraft(next); };
  useEffect(() => {
    mounted.current = true; const unsubscribe = spendingAi.subscribe(value => { if (mounted.current) setAi(value); });
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { mounted.current = false; cancel(); unsubscribe(); listener.remove(); };
  }, []);
  useEffect(() => { if (lock.locked || lock.covered) cancel(); }, [lock.locked, lock.covered]);
  usePreventRemove(dirty || !!busy || aiBusy, ({ data }) => {
    if (busy || aiBusy) { Alert.alert('Đang xử lý', 'Hủy thao tác hoặc chờ lưu xong. Bản nháp được giữ.'); return; }
    Alert.alert('Bỏ bản nháp?', 'Roadmap chưa lưu sẽ bị bỏ.', [{ text: 'Tiếp tục sửa', style: 'cancel' }, { text: 'Bỏ bản nháp', style: 'destructive', onPress: () => { try { latest.current.lock.assertUnlocked(); navigation.dispatch(data.action); } catch (e) { setError(errorMessage(e)); } } }]);
  });
  const check = (request: number, revision?: number) => {
    latest.current.lock.assertUnlocked();
    if (!mounted.current || request !== generation.current || latest.current.lock.locked || latest.current.lock.covered || AppState.currentState !== 'active') throw new Error('Bản nháp đã thay đổi hoặc thao tác đã hủy.');
    if (revision !== undefined && revision !== latest.current.store.revision) throw new Error('Sổ đã thay đổi. Tạo lại roadmap để tính theo dữ liệu mới.');
  };
  const operation = async (label: string, work: (request: number) => Promise<void>) => {
    if (active.current || aiBusy) return; active.current = true; const request = ++generation.current; setBusy(label); setError('');
    try { check(request); await work(request); }
    catch (e) { if (mounted.current && request === generation.current) setError(errorMessage(e)); }
    finally { active.current = false; controller.current = null; if (mounted.current) setBusy(''); }
  };
  const stateFor = (catalog: MealOption[]) => ({ ...latest.current.store.ledger, spending: { ...latest.current.store.ledger.spending, catalog: [...new Map([...latest.current.store.ledger.spending.catalog, ...catalog].map(m => [m.id, m])).values()] } });
  const guardVersion = (value: Draft | null) => { if (value?.expectedVersion !== null && value && latest.current.store.ledger.spending.plans.find(p => p.config.id === value.plan.config.id)?.version !== value.expectedVersion) throw new Error('Bản đã lưu đã thay đổi. Mở lại trước khi sửa.'); };
  const create = (withoutAi: boolean) => void operation('Đọc món và giá online…', async request => {
    const current = latest.current.store, revision = current.revision, input = textRef.current, parsed = parseRoadmapPrompt(input, localDateKey(new Date().toISOString(), current.ledger.settings.timezone));
    assertRoadmapFoodSafety(parsed.preferenceText); guardVersion(draftRef.current);
    if (withoutAi && /khong|chi an|bat buoc|tranh|han che|tuan|lan|it nhat|toi da|dung\s*\d/.test(normalizeRoadmapText(parsed.preferenceText))) throw new Error('Bộ tính chưa duyệt được điều kiện ăn bắt buộc. Dùng AI local hoặc sửa mô tả chỉ gồm kỳ và ngân sách.');
    if (!withoutAi && !spendingAiAvailable) { setModelOpen(true); throw new Error('AI local cần bản Sổ Ví trên iPhone. Có thể chọn rõ “Tạo bằng bộ tính” với mô tả không có điều kiện ăn bắt buộc.'); }
    if (!withoutAi && spendingAi.state.phase !== 'ready') {
      setBusy('Kiểm tra AI local…');
      try { const ready = await spendingAi.checkModel(); check(request, revision); if (!ready) throw new Error('Chưa có mô hình AI local. Tải hoặc nhập file trong phần thiết lập; bộ tính là lựa chọn riêng.'); }
      catch (e) { check(request, revision); setModelOpen(true); throw e; }
      setBusy('Đọc món và giá online…');
    }
    controller.current = new AbortController(); const source = await loadOnlineMeals(parsed.area, controller.current.signal); check(request, revision);
    const catalog = source.meals; let preferences = emptyPreferences();
    if (!withoutAi) {
      setBusy('AI local đọc sở thích…');
      const preferenceText = parsed.preferenceText || 'Không có sở thích hoặc tần suất. Trả về các danh sách rỗng.';
      const aiCatalog = roadmapAiCatalog(parsed.preferenceText, catalog);
      const proposed = await spendingAi.infer(preferenceText, roadmapAiAliases(aiCatalog));
      check(request, revision); preferences = restoreRoadmapAiPreferences(proposed, aiCatalog); reviewRoadmapPreferences(parsed.preferenceText, preferences, catalog);
    } else if (parsed.preferenceText) {
      const clauses = normalizeRoadmapText(parsed.preferenceText).split(/[,;]/).map(v => v.trim()).filter(Boolean);
      for (const clause of clauses) {
        const match = clause.match(/^(?:thich|uu tien)\s+(.+)$/); if (!match) throw new Error('Bộ tính chỉ hiểu món thích theo tên nguồn; sửa mô tả hoặc dùng AI local.');
        const found = catalog.filter(m => normalizeRoadmapText(m.name).includes(match[1])); if (!found.length) throw new Error('Nguồn chưa có món được thích. Sửa mô tả hoặc dùng AI local.'); preferences.likedIds.push(...found.map(m => m.id));
      }
      preferences.likedIds = [...new Set(preferences.likedIds)];
    }
    check(request, revision); setBusy('Tính ngân sách chính xác…');
    const old = draftRef.current; const config: PlanConfig = { id: old?.plan.config.id ?? newId(), name: parsed.area, startDay: parsed.startDay, endDay: parsed.endDay, timezone: current.ledger.settings.timezone, budget: parsed.budget, reserve: parsed.reserve, mealsPerDay: parsed.mealsPerDay, allowCooking: false, ...copy(scope), fixed: scope.fixed.map(f => ({ ...f, amount: parseMoneyInput(f.amount) })) };
    const plan = planSpending(stateFor(catalog), config, catalog, preferences, new Date().toISOString(), old?.plan);
    check(request, revision); updateDraft({ plan, catalog, revision, expectedVersion: old?.expectedVersion ?? null, mode: withoutAi ? 'math' : 'ai', warnings: source.warnings, text: input });
    setSelectedDay(plan.config.startDay); setWeek(0); setDetail(''); setSwap(''); pinned.current = null; setPromptOpen(false); setDirty(true);
  });
  const save = () => void operation('Đang lưu roadmap…', async request => {
    const value = draftRef.current; if (!value) return; check(request, value.revision); guardVersion(value);
    if (value.text !== textRef.current) throw new Error('Mô tả đã thay đổi. Tạo lại roadmap trước khi lưu.');
    assertRoadmapFoodSafety(value.text, value.plan.preferences);
    const result = await latest.current.store.execute({ type: 'spending.roadmap.upsert', mutationId: newId(), payload: { catalog: copy(value.catalog), plan: copy(value.plan), expectedVersion: value.expectedVersion } }, value.revision);
    const saved = result.ledger.spending.plans.find(p => p.config.id === value.plan.config.id)!;
    const current = draftRef.current;
    // A committed version belongs to this plan even when newer edits cancel its visual result.
    if (mounted.current && current?.plan.config.id === value.plan.config.id && current.expectedVersion === value.expectedVersion) updateDraft({ ...current, plan: { ...current.plan, version: saved.version }, expectedVersion: saved.version!, revision: current === value ? result.revision : current.revision });
    if (!mounted.current || request !== generation.current) return;
    check(request); if (latest.current.store.revision > result.revision) throw new Error('Sổ đã đổi sau khi lưu. Mở lại roadmap đã lưu.');
    updateDraft({ ...value, plan: copy(saved), revision: result.revision, expectedVersion: saved.version!, mode: 'saved' }); setDirty(false);
  });
  const open = (plan: SpendingPlan) => {
    latest.current.lock.assertUnlocked(); if (latest.current.lock.locked || latest.current.lock.covered || AppState.currentState !== 'active') throw new Error('Mở khóa ứng dụng trước khi mở roadmap.'); cancel();
    const input = `${plan.config.name}, ${Math.round((Date.parse(plan.config.endDay) - Date.parse(plan.config.startDay)) / 86400000) + 1} ngày, ${plan.config.budget} VND, dự phòng ${plan.config.reserve} VND, ${plan.config.mealsPerDay} bữa/ngày, bắt đầu ${plan.config.startDay}`;
    textRef.current = input; setText(input); setScope(copy({ walletIds: plan.config.walletIds, categoryIds: plan.config.categoryIds, fixed: plan.config.fixed }));
    const catalog = [...new Map([...plan.meals.map(m => m.meal), ...store.ledger.spending.catalog.filter(m => /^online-/.test(m.id))].map(m => [m.id, m])).values()];
    updateDraft({ plan: copy(plan), catalog, revision: latest.current.store.revision, expectedVersion: plan.version!, mode: 'saved', warnings: ['Ảnh chụp đã lưu, có thể cũ. Chưa đọc lại giá online.'], text: input });
    setSelectedDay(plan.config.startDay); setWeek(0); setPromptOpen(false); setDirty(false); setDetail(''); setSwap(''); setError(''); pinned.current = null;
  };
  const openGuarded = (plan: SpendingPlan) => { if (busy || aiBusy) return; if (!dirty) { try { open(plan); } catch (e) { setError(errorMessage(e)); } return; } Alert.alert('Mở roadmap đã lưu?', 'Bản nháp đang sửa sẽ bị bỏ.', [{ text: 'Giữ bản nháp', style: 'cancel' }, { text: 'Mở', onPress: () => { try { open(plan); } catch (e) { setError(errorMessage(e)); } } }]); };
  const changePlan = (plan: SpendingPlan, recomputedRevision?: number) => { try { const value = draftRef.current; if (!value) return; latest.current.lock.assertUnlocked(); if (latest.current.lock.locked || latest.current.lock.covered || AppState.currentState !== 'active') throw new Error('Mở khóa ứng dụng trước khi sửa.'); guardVersion(value); if ((recomputedRevision ?? value.revision) !== latest.current.store.revision) throw new Error('Sổ đã thay đổi. Cân lại ngân sách hoặc tạo lại trước khi đổi bữa.'); assertRoadmapFoodSafety(value.text, plan.preferences); if (!edit()) return; updateDraft({ ...value, plan, revision: recomputedRevision ?? value.revision }); } catch (e) { setError(errorMessage(e)); } };
  const changePreferences = (preferences: Preferences) => {
    try { const value = draftRef.current; if (!value) return; if (value.revision !== latest.current.store.revision) throw new Error('Sổ đã thay đổi. Cân lại ngân sách trước khi sửa sở thích.'); assertRoadmapFoodSafety(value.text, preferences); changePlan(planSpending(stateFor(value.catalog), value.plan.config, value.catalog, preferences, new Date().toISOString(), value.plan)); }
    catch (e) { setError(errorMessage(e)); }
  };
  const rebalance = (candidate?: { day: string; index: number; id: string }) => {
    try {
      const value = draftRef.current; if (!value) return; latest.current.lock.assertUnlocked(); const revision = latest.current.store.revision; const previous = candidate ? replaceMeal(stateFor(value.catalog), value.plan, candidate.day, candidate.index, candidate.id, value.catalog, value.plan.preferences, new Date().toISOString()).plan : copy(value.plan);
      const slot = previous.meals.find(m => keyOf(m) === (candidate ? `${candidate.day}/${candidate.index}` : pinned.current)); const oldLock = slot?.locked; if (slot) slot.locked = true;
      const plan = planSpending(stateFor(value.catalog), previous.config, value.catalog, previous.preferences, new Date().toISOString(), previous);
      if (slot) plan.meals.find(m => keyOf(m) === keyOf(slot))!.locked = oldLock!;
      changePlan(plan, revision); if (candidate) pinned.current = `${candidate.day}/${candidate.index}`; setSwap('');
    } catch (e) { setError(errorMessage(e)); }
  };
  const openLink = async (url: string) => { try { latest.current.lock.assertUnlocked(); await Linking.openURL(url); } catch (e) { if (mounted.current) setError(errorMessage(e)); } };
  const plan = draft?.plan, days = plan ? [...new Set(plan.meals.map(m => m.day))] : [], weekDays = days.slice(week * 7, week * 7 + 7);
  const stale = !!draft && draft.revision !== store.revision;
  let totals: ReturnType<typeof spendingTotals> | null = null, totalsError = '';
  try { if (plan) totals = spendingTotals(store.ledger, plan, new Date().toISOString()); } catch (e) { totalsError = errorMessage(e); }
  let saveError = '';
  try { if (draft) validatePlanSave(stateFor(draft.catalog), draft.plan, new Date().toISOString(), store.ledger.spending.plans.find(p => p.config.id === draft.plan.config.id)); } catch (e) { saveError = errorMessage(e); }
  const canSave = !!draft && dirty && !stale && !saveError && draft.text === text && !busy && !aiBusy;
  let barSpace = 100;
  const budgetSegments = plan && totals ? [{ amount: totals.spent, color: colors.income }, { amount: totals.planned, color: colors.transfer }, { amount: totals.fixedUnpaid, color: colors.warning }, { amount: plan.config.reserve, color: '#A78BFA' }, { amount: totals.remaining, color: colors.accent }].map(segment => { const width = Math.min(barSpace, Math.max(0, Number(BigInt(segment.amount) * 10000n / BigInt(plan.config.budget)) / 100)); barSpace -= width; return { ...segment, width }; }) : [];
  const setScopeField = <K extends keyof typeof scope>(field: K, value: typeof scope[K]) => { if (!edit()) return; setScope(s => ({ ...s, [field]: value })); if (draftRef.current) updateDraft({ ...draftRef.current, text: '' }); };
  return <Page title="Roadmap ăn uống" back>
    {(!draft || promptOpen) ? <Card>
      <Text style={styles.heading}>Ăn gì, trong ngân sách của bạn</Text>
      <Field label="Mô tả roadmap" multiline value={text} maxLength={1000} placeholder="Quận 10, 7 ngày, 900k, 3 bữa/ngày" onChangeText={value => { if (!edit()) return; textRef.current = value; setText(value); }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Ví dụ mô tả" accessibilityState={{ expanded: help }} onPress={() => setHelp(v => !v)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[styles.secondary, { color: colors.accent }]}>Gợi ý mô tả {help ? '−' : '+'}</Text></Pressable>
      {help && <Text style={styles.helper}>Quận 10, 7 ngày, 900k, 3 bữa/ngày, thích cơm, không ăn phở. Thêm “dự phòng 100k” hoặc “bắt đầu 2026-12-20”. Nguồn hiện hỗ trợ Quận 10; chưa xác minh nguyên liệu/dị ứng.</Text>}
      <Button title="Tạo roadmap" disabled={!!busy || aiBusy || !text.trim()} onPress={() => create(false)} />
      <Text style={styles.helper}>Qwen local hiểu sở thích · bộ tính giữ số tiền VND chính xác.</Text>
    </Card> : <Button title="Sửa mô tả" secondary icon="create-outline" onPress={() => setPromptOpen(true)} />}
    {!!busy && <><Text accessibilityLiveRegion="polite" style={styles.text}>{busy}</Text><Button title="Hủy thao tác" secondary disabled={busy === 'Đang lưu roadmap…'} onPress={cancel} /></>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!ai.error && <Text accessibilityRole="alert" style={styles.error}>{ai.error}</Text>}
    {!busy && !draft && <Text style={styles.helper}>{!spendingAiAvailable ? 'AI local cần bản iPhone riêng.' : `AI local: ${aiPhase}.`}</Text>}
    {draft?.warnings.map(warning => <Text key={warning} style={styles.advisory}>{warning}</Text>)}
    {plan && draft && <>
      <Card>
        {totals && <>
          <View style={styles.spread}><Text style={styles.kpiLabel}>Còn lại cuối kỳ</Text><Text style={styles.secondary}>{draft.mode === 'saved' ? `Đã lưu · v${plan.version}` : draft.mode === 'math' ? 'Bộ tính · chưa lưu' : 'Chưa lưu'}</Text></View><Text style={[styles.kpiHighlight, { fontSize: 30 }, BigInt(totals.remaining) < 0n && { color: colors.expense }]}>{formatMoney(totals.remaining)}</Text>
          <Text style={styles.secondary}>Ngân sách {formatMoney(plan.config.budget)} · bữa dự trù {formatMoney(totals.planned)}</Text>
          <View accessibilityLabel="Phân bổ ngân sách: đã chi, dự trù bữa, cố định, dự phòng, còn lại" style={styles.progressBar}>
            {budgetSegments.map((segment, i) => <View key={i} style={{ height: 8, backgroundColor: segment.color, width: `${segment.width}%` }} />)}
          </View>
          {BigInt(totals.remaining) < 0n && <Text accessibilityRole="alert" style={styles.error}>Vượt ngân sách. Cân lại để giữ dự phòng.</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Chi tiết ngân sách" accessibilityState={{ expanded: budgetOpen }} onPress={() => setBudgetOpen(v => !v)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[styles.secondary, { color: colors.accent }]}>Chi tiết ngân sách {budgetOpen ? '−' : '+'}</Text></Pressable>
          {budgetOpen && <><Text style={styles.secondary}>{plan.config.name} · {plan.config.startDay}–{plan.config.endDay}</Text><Text style={styles.helper}>{draft.mode === 'math' ? 'Bộ tính · không dùng AI' : draft.mode === 'ai' ? 'Sở thích do AI local đề xuất' : 'Ảnh chụp đã lưu'} · không tự ghi chi tiêu.</Text><View style={styles.metricGrid}>{[{ name: 'Đã chi', value: totals.spent }, { name: 'Dự trù bữa', value: totals.planned }, { name: 'Cố định', value: totals.fixedUnpaid }, { name: 'Dự phòng', value: plan.config.reserve }].map(metric => <View key={metric.name} style={styles.metricBox}><Text style={styles.secondary}>{metric.name}</Text><Text style={styles.metricVal}>{formatMoney(metric.value)}</Text></View>)}</View></>}
        </>}
        {!!totalsError && <Text accessibilityRole="alert" style={styles.error}>{totalsError}</Text>}
        {stale && <Text accessibilityRole="alert" style={styles.error}>Sổ đã thay đổi. Tạo lại roadmap hoặc cân lại để tính theo chi thực tế.</Text>}
        {!!saveError && dirty && <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text>}
      </Card>
      <Choice label="Xem roadmap" items={[{ id: 'day', name: 'Theo ngày' }, { id: 'week', name: 'Theo tuần' }]} selected={[view]} onSelect={setView} />
      {days.length > 7 && <Choice label="Tuần đang xem" dropdown items={Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => ({ id: String(i), name: `Tuần ${i + 1} · ${days[i * 7]}` }))} selected={[String(week)]} onSelect={id => { setWeek(Number(id)); setSelectedDay(days[Number(id) * 7]); }} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>{weekDays.map(day => <Pressable key={day} accessibilityRole="button" accessibilityLabel={`Ngày ${day}`} accessibilityState={{ selected: day === selectedDay }} onPress={() => { setSelectedDay(day); setView('day'); setSwap(''); setDetail(''); }} style={[styles.chip, day === selectedDay && { borderColor: colors.accent, backgroundColor: colors.raised }]}><Text style={styles.text}>{day.slice(8)}/{day.slice(5, 7)}</Text><Text style={styles.secondary}>{day === selectedDay ? 'Đang chọn' : day === today ? 'Hôm nay' : ' '}</Text></Pressable>)}</ScrollView>
      {view === 'week' ? <Card>{weekDays.map(day => {
        const meals = plan.meals.filter(m => m.day === day), total = meals.reduce((n, m) => n + BigInt(m.meal.price), 0n);
        return <Pressable key={day} accessibilityRole="button" accessibilityLabel={`Xem ngày ${day}, ${formatMoney(total)}`} onPress={() => { setSelectedDay(day); setView('day'); }} style={[styles.spread, { flexWrap: 'wrap', minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }]}><Text style={styles.text}>{day.slice(8)}/{day.slice(5, 7)} · {meals.map(m => foodSymbol(m.meal.name)).join(' ')}</Text><Text style={styles.metricVal}>{formatMoney(total)}</Text></Pressable>;
      })}</Card> : <View style={styles.timeline}>{plan.meals.filter(m => m.day === selectedDay).map(slot => {
        const key = keyOf(slot), protectedMeal = protectedSlot(slot, today);
        const persisted = store.ledger.spending.plans.find(p => p.config.id === plan.config.id)?.meals.find(m => keyOf(m) === key);
        const savedProtected = !!persisted && protectedSlot(persisted, today);
        const candidates = swap === key && !protectedMeal ? draft.catalog.filter(m => m.id !== slot.meal.id && !plan.preferences.excludedIds.includes(m.id)).flatMap(meal => {
          try { return [{ meal, replacement: replaceMeal(stateFor(draft.catalog), plan, slot.day, slot.index, meal.id, draft.catalog, plan.preferences, new Date().toISOString()) }]; }
          catch { return []; }
        }).slice(0, 6) : [];
        return <View key={key} style={{ gap: 8 }}><View style={styles.timelineNode} /><Card>
          <View style={[styles.row, { alignItems: 'flex-start' }]}><Text accessible={false} style={{ fontSize: 42 }}>{foodSymbol(slot.meal.name)}</Text><View style={{ flex: 1, gap: 4 }}><Text style={styles.secondary}>Bữa {slot.index + 1}{slot.completed ? ' · Đã ăn' : slot.locked ? ' · Đã khóa' : ''}</Text><Text style={styles.heading}>{slot.meal.name}</Text><Text numberOfLines={1} style={styles.secondary}>{slot.meal.portion.replace(/^1 phần · /, '')}</Text><Text style={styles.amount}>{formatMoney(slot.meal.price)}</Text></View></View>
          <View style={styles.pair}><View style={styles.half}><Button title={`Đổi bữa ${slot.index + 1}`} secondary disabled={protectedMeal || !!busy || aiBusy} onPress={() => { setSwap(swap === key ? '' : key); setDetail(''); }} /></View><View style={styles.half}><Button title={`Chi tiết bữa ${slot.index + 1}`} secondary onPress={() => { setDetail(detail === key ? '' : key); setSwap(''); }} /></View></View>
          {detail === key && <>
            <Text style={styles.text}>{slot.meal.address || 'Chưa có địa chỉ'}</Text><Text style={styles.helper}>Đọc nguồn {slot.meal.pricedAt} · giá niêm yết giao món, ước tính; có thể khác khi đến quán, chưa gồm phí giao. Nguyên liệu chưa xác nhận.</Text><Text selectable style={styles.secondary}>{slot.meal.priceSource}</Text>
            {/^https:\/\//.test(slot.meal.priceSource) && <Button title="Mở nguồn giá" secondary onPress={() => void openLink(slot.meal.priceSource)} />}
            {!!slot.meal.address && <Button title="Xem địa chỉ trên bản đồ" secondary onPress={() => void openLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(slot.meal.address)}`)} />}
            {slot.day >= today && !savedProtected && <><Button title={slot.locked ? 'Bỏ khóa bữa' : 'Khóa bữa'} secondary disabled={!!busy} onPress={() => changePlan({ ...plan, meals: plan.meals.map(m => keyOf(m) === key ? { ...m, locked: !m.locked } : m) })} /><Button title={slot.completed ? 'Bỏ xác nhận đã ăn' : 'Xác nhận đã ăn'} secondary disabled={!!busy} onPress={() => changePlan({ ...plan, meals: plan.meals.map(m => keyOf(m) === key ? { ...m, completed: !m.completed } : m) })} /><Choice label={`Chi đã ghi sổ cho bữa ${slot.index + 1}`} dropdown items={[{ id: '', name: 'Chưa liên kết' }, ...store.ledger.transactions.filter(t => t.kind === 'expense').map(t => ({ id: t.id, name: `${t.note || 'Khoản chi'} · ${formatMoney(t.amount)}` }))]} selected={[slot.transactionId ?? '']} onSelect={id => changePlan({ ...plan, meals: plan.meals.map(m => keyOf(m) === key ? { ...m, transactionId: id || null } : m) })} /></>}
          </>}
          {swap === key && !protectedMeal && <>
            <Text style={styles.helper}>Đổi một bữa, giữ các bữa khác. Cân lại giữ món vừa chọn và các bữa được bảo vệ.</Text>
            {candidates.map(({ meal, replacement }) => {
              let allowed = true; try { validatePlanSave(stateFor(draft.catalog), replacement.plan, new Date().toISOString(), store.ledger.spending.plans.find(p => p.config.id === plan.config.id)); } catch { allowed = false; }
              return <View key={meal.id} style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}><Text style={styles.text}>{foodSymbol(meal.name)} {meal.name}</Text><Text style={styles.secondary}>{formatMoney(meal.price)} · chênh {BigInt(replacement.delta) > 0n ? '+' : ''}{formatMoney(replacement.delta)} · còn {formatMoney(replacement.remaining)}</Text><Button title={`Chọn ${meal.name}`} secondary disabled={!allowed || !!busy} onPress={() => { changePlan(replacement.plan); pinned.current = key; setSwap(''); }} />{!allowed && <Button title={`Chọn & cân lại ${meal.name}`} secondary disabled={!!busy} onPress={() => rebalance({ day: slot.day, index: slot.index, id: meal.id })} />}</View>;
            })}
          </>}
        </Card></View>;
      })}</View>}
      {dirty && <Button title="Lưu roadmap" disabled={!canSave} onPress={save} />}
      <Pressable accessibilityRole="button" accessibilityLabel="Duyệt & sửa sở thích" accessibilityState={{ expanded: conditions }} onPress={() => setConditions(v => !v)} style={[styles.row, { minHeight: 44, paddingVertical: 8 }]}><Icon name="options-outline" /><Text style={[styles.secondary, { flex: 1 }]}>Sở thích ăn uống</Text><Icon name={conditions ? 'chevron-up' : 'chevron-down'} /></Pressable>
      {conditions && <Card><Text style={styles.heading}>{draft.mode === 'math' ? 'Điều kiện bộ tính' : 'Sở thích đang duyệt'}</Text><Text style={styles.secondary}>Thích: {plan.preferences.likedIds.map(id => draft.catalog.find(m => m.id === id)?.name ?? id).join(', ') || 'chưa chọn'}{`\n`}Không ăn: {plan.preferences.excludedIds.map(id => draft.catalog.find(m => m.id === id)?.name ?? id).join(', ') || 'chưa chọn'}</Text><Choice label="Món thích" dropdown multiple items={draft.catalog} selected={plan.preferences.likedIds} onSelect={id => changePreferences({ ...plan.preferences, likedIds: toggle(plan.preferences.likedIds, id) })} /><Choice label="Món không ăn" dropdown multiple items={draft.catalog} selected={plan.preferences.excludedIds} onSelect={id => changePreferences({ ...plan.preferences, excludedIds: toggle(plan.preferences.excludedIds, id) })} />{plan.preferences.frequency.map(f => <View key={f.mealId} style={{ gap: 8 }}><Text style={styles.text}>{draft.catalog.find(m => m.id === f.mealId)?.name}</Text><View style={styles.pair}><View style={styles.half}><Field label="Ít nhất / 7 ngày" keyboardType="number-pad" value={String(f.min)} onChangeText={v => changePreferences({ ...plan.preferences, frequency: plan.preferences.frequency.map(x => x.mealId === f.mealId ? { ...x, min: Number(v) } : x) })} /></View><View style={styles.half}><Field label="Tối đa / 7 ngày" keyboardType="number-pad" value={String(f.max)} onChangeText={v => changePreferences({ ...plan.preferences, frequency: plan.preferences.frequency.map(x => x.mealId === f.mealId ? { ...x, max: Number(v) } : x) })} /></View></View></View>)}<Text style={styles.helper}>Dị ứng/nguyên liệu chưa xác nhận: roadmap không chứng nhận an toàn ăn uống.</Text></Card>}
      <Button title="Cân lại ngân sách" secondary disabled={!!busy || aiBusy} onPress={() => rebalance()} />
    </>}
    <Pressable accessibilityRole="button" accessibilityLabel="Kế hoạch đã lưu & phạm vi chi" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(v => !v)} style={[styles.row, { minHeight: 44, paddingVertical: 8 }]}><Icon name="wallet-outline" /><Text style={[styles.secondary, { flex: 1 }]}>Đã lưu & phạm vi chi</Text><Icon name={advanced ? 'chevron-up' : 'chevron-down'} /></Pressable>
    {advanced && <Card>
      <Choice label="Mở roadmap đã lưu" dropdown items={store.ledger.spending.plans.map(p => ({ id: p.config.id, name: `${p.config.name} · ${p.config.startDay}` }))} selected={plan ? [plan.config.id] : []} onSelect={id => openGuarded(store.ledger.spending.plans.find(p => p.config.id === id)!)} />
      <View style={styles.pair}><View accessibilityLabel="Ví · bỏ trống = tất cả" style={styles.half}><Choice label="Ví" dropdown multiple items={store.ledger.wallets} selected={scope.walletIds} onSelect={id => setScopeField('walletIds', toggle(scope.walletIds, id))} /></View><View accessibilityLabel="Danh mục chi · bỏ trống = tất cả" style={styles.half}><Choice label="Danh mục chi" dropdown multiple items={store.ledger.categories.filter(c => c.kind === 'expense')} selected={scope.categoryIds} onSelect={id => setScopeField('categoryIds', toggle(scope.categoryIds, id))} /></View></View>
      <Text style={styles.helper}>Bỏ trống ví hoặc danh mục = tất cả.</Text>
      <Text style={styles.helper}>Đã chi theo phạm vi được trừ tự động. Khoản cố định chưa chi có thể liên kết giao dịch để tránh trừ hai lần.</Text>
      {scope.fixed.map((fixed, i) => <View key={fixed.id} style={{ gap: 8 }}><Field label={`Tên khoản cố định ${i + 1}`} value={fixed.name} onChangeText={v => setScopeField('fixed', scope.fixed.map(f => f.id === fixed.id ? { ...f, name: v } : f))} /><Field label={`Tiền khoản cố định ${i + 1}`} keyboardType="number-pad" value={fixed.amount} onChangeText={v => setScopeField('fixed', scope.fixed.map(f => f.id === fixed.id ? { ...f, amount: v } : f))} /><Choice label={`Liên kết khoản cố định ${i + 1}`} dropdown items={[{ id: '', name: 'Chưa chi' }, ...store.ledger.transactions.filter(t => t.kind === 'expense').map(t => ({ id: t.id, name: `${t.note || 'Khoản chi'} · ${formatMoney(t.amount)}` }))]} selected={[fixed.transactionId ?? '']} onSelect={id => setScopeField('fixed', scope.fixed.map(f => f.id === fixed.id ? { ...f, transactionId: id || null } : f))} /><Button title={`Bỏ khoản ${i + 1}`} secondary onPress={() => setScopeField('fixed', scope.fixed.filter(f => f.id !== fixed.id))} /></View>)}
      <Button title="Thêm khoản cố định" secondary disabled={scope.fixed.length >= 100} onPress={() => setScopeField('fixed', [...scope.fixed, { id: newId(), name: '', amount: '', transactionId: null }])} />
      {draft && <Button title="Roadmap mới" secondary disabled={!!busy || aiBusy} onPress={() => { if (!edit()) return; draftRef.current = null; setDraft(null); setPromptOpen(true); pinned.current = null; }} />}
    </Card>}
    <Pressable accessibilityRole="button" accessibilityLabel="Thiết lập AI local" accessibilityState={{ expanded: modelOpen }} style={[styles.row, { minHeight: 44, paddingVertical: 8 }]} onPress={() => setModelOpen(v => !v)}><Icon name="hardware-chip-outline" /><View style={{ flex: 1 }}><Text style={styles.secondary}>AI local & bộ tính</Text><Text style={styles.secondary}>{SPENDING_MODEL.name}</Text></View><Icon name={modelOpen ? 'chevron-up' : 'chevron-down'} /></Pressable>
    {modelOpen && <Card>
      <Text style={styles.heading}>{SPENDING_MODEL.name}</Text><Text style={styles.helper}>Khoảng 3,44 GB · cần 3,8 GB trống. Tải/nhập file được kiểm tra đúng mô hình. Prompt và sổ không gửi đến nguồn thực đơn.</Text>
      <Text style={styles.secondary}>{aiPhase}{ai.phase === 'downloading' ? ` · ${Math.round(ai.progress * 100)}%` : ''}</Text>
      <View style={styles.pair}><View style={styles.half}>
      <Button title="Kiểm tra mô hình" secondary disabled={!!busy || aiBusy || !spendingAiAvailable} onPress={() => void operation('Kiểm tra AI local…', async request => { await spendingAi.checkModel(); check(request); })} />
      </View><View style={styles.half}>
      <Button title="Tải mô hình miễn phí" secondary disabled={!!busy || aiBusy || !spendingAiAvailable} onPress={() => Alert.alert('Tải mô hình 3,44 GB?', 'Dùng Wi-Fi và giữ ứng dụng mở. Đây là tải file, không gửi sổ hay prompt.', [{ text: 'Để sau', style: 'cancel' }, { text: 'Tải', onPress: () => void operation('Đang tải mô hình…', async request => { await spendingAi.downloadModel(); check(request); }) }])} />
      </View></View><View style={styles.pair}><View style={styles.half}>
      <Button title="Nhập file GGUF" secondary disabled={!!busy || aiBusy || !spendingAiAvailable} onPress={() => void operation('Nhập mô hình…', async request => { await spendingAi.importModel(); check(request); })} />
      </View><View style={styles.half}>
      <Button title="Xóa file mô hình" secondary disabled={!!busy || aiBusy || !spendingAiAvailable} onPress={() => Alert.alert('Xóa mô hình?', 'Chỉ xóa file AI; giữ roadmap và sổ.', [{ text: 'Giữ', style: 'cancel' }, { text: 'Xóa mô hình', style: 'destructive', onPress: () => void operation('Xóa mô hình…', async request => { await spendingAi.deleteModel(); check(request); }) }])} />
      </View></View>
      <Text style={styles.helper}>Bộ tính dùng món và giá từ nguồn, không dùng AI. Điều kiện ăn bắt buộc cần AI local duyệt; không tự bỏ điều kiện.</Text>
      <Button title="Tạo bằng bộ tính" secondary disabled={!!busy || aiBusy || !text.trim()} onPress={() => create(true)} />
    </Card>}
  </Page>;
}
