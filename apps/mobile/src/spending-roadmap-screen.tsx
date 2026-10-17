import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { dishImage } from './dish-images';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { formatMoney, localDateKey, parseMoneyInput } from './domain';
import { errorMessage, newId, useLedger } from './store';
import { useAppLock } from './app-lock';
import { Button, Card, Choice, Icon, Page, colors, styles, toggle } from './ui';
import { planSpending, protectedSlot, replaceMeal, spendingTotals, validatePlanSave, type MealOption, type MealSlot, type PlanConfig, type Preferences, type SpendingPlan } from './spending';
import { SPENDING_MODEL, spendingAi, spendingAiAvailable, type AiState } from './spending-ai';
import { isThinkingIncomplete } from './spending-thinking';
import { loadRoadmapMeals } from './spending-discovery';
import { loadFoodVenues } from './spending-venues-native';
import { FOOD_NOTICE, googleMapsSearch, assertGoogleMapsUrl, venueMapsUrl, venueEvidence, retrievedVenueContext, type FoodVenue } from './spending-venues';
import { isPlanningEstimate, isCookedEstimate, cookedIngredients, mealFitsSlot } from './spending-meal-estimates';
import { assertRoadmapFoodSafety, normalizeRoadmapText, parseRoadmapPrompt, reviewRoadmapPreferences, roadmapAiCatalog, roadmapAiAliases, restoreRoadmapAiPreferences, dishNames, matchCatalogDishes, localDishSignal, thinkingAliases, thinkingMenu, restoreThinkingPreferences, minimumEatOutCost } from './spending-roadmap';
import { Field } from './ui';

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const emptyPreferences = (): Preferences => ({ likedIds: [], excludedIds: [], excludedAllergens: [], frequency: [] });
type Draft = { plan: SpendingPlan; catalog: MealOption[]; revision: number; expectedVersion: number | null; mode: 'ai' | 'math' | 'saved'; warnings: string[]; text: string; thinking?: { tips: string[]; reasoning: string; attempts: number } };
const keyOf = (slot: MealSlot) => `${slot.day}/${slot.index}`;
const suggestedTimes = (meals: number) => meals === 1 ? ['12:00'] : meals === 2 ? ['12:00', '18:30'] : ['07:30', '12:00', '18:30'];

export function RoadmapScreen() {
  const store = useLedger(), lock = useAppLock(), navigation = useNavigation();
  const latest = useRef({ store, lock }); latest.current = { store, lock };
  const today = localDateKey(new Date().toISOString(), store.ledger.settings.timezone);
  const [text, setText] = useState(''); const textRef = useRef(text); textRef.current = text;
  const [draft, setDraft] = useState<Draft | null>(null); const draftRef = useRef(draft); draftRef.current = draft;
  const [promptOpen, setPromptOpen] = useState(true), [help, setHelp] = useState(false), [advanced, setAdvanced] = useState(false), [modelOpen, setModelOpen] = useState(false), [conditions, setConditions] = useState(false), [budgetOpen, setBudgetOpen] = useState(false);
  const [scope, setScope] = useState<{ walletIds: string[]; categoryIds: string[]; fixed: PlanConfig['fixed'] }>({ walletIds: [], categoryIds: [], fixed: [] });
  const [view, setView] = useState('day'), [selectedDay, setSelectedDay] = useState(''), [week, setWeek] = useState(0), [detail, setDetail] = useState(''), [swap, setSwap] = useState('');
  const [thinkMode, setThinkMode] = useState(false), [reasoningOpen, setReasoningOpen] = useState(false);
  const [ai, setAi] = useState<AiState>(spendingAi.state), [busy, setBusy] = useState(''), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
  const [waiting, setWaiting] = useState<{ step: number; started: number; usesAi: boolean } | null>(null), [elapsed, setElapsed] = useState(0);
  const [discovery, setDiscovery] = useState<{ venues: FoodVenue[]; pricedSources: string[]; warnings: string[] } | null>(null), [venuesOpen, setVenuesOpen] = useState(false);
  const [venueResults, setCandidates] = useState<{ key: string; phase: 'loading' | 'ready' | 'error'; venues: FoodVenue[]; error: string } | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true), generation = useRef(0), active = useRef(false), controller = useRef<AbortController | null>(null);
  const pinned = useRef<string | null>(null);
  const aiBusy = !['ready', 'missing', 'error'].includes(ai.phase);
  const aiPhase = ({ missing: 'Chưa có mô hình', checking: 'Đang xác minh', downloading: 'Đang tải', importing: 'Đang nhập', ready: 'Sẵn sàng', loading: 'Đang nạp AI', inferring: 'Đang hiểu sở thích', thinking: 'Đang suy nghĩ', stopping: 'Đang dừng', error: 'Chưa sẵn sàng' })[ai.phase];
  const stopElapsed = () => { if (elapsedTimer.current !== null) { clearInterval(elapsedTimer.current); elapsedTimer.current = null; } };
  const cancel = () => { generation.current++; controller.current?.abort(); stopElapsed(); if (mounted.current) { setWaiting(null); setCandidates(null); if (active.current) setBusy('Đang dừng thao tác…'); } void spendingAi.cancel(); };
  const edit = () => { try { latest.current.lock.assertUnlocked(); if (latest.current.lock.locked || latest.current.lock.covered || AppState.currentState !== 'active') throw new Error('Mở khóa ứng dụng trước khi sửa.'); } catch (e) { setError(errorMessage(e)); return false; } cancel(); setDirty(true); setError(''); return true; };
  const updateDraft = (next: Draft) => { draftRef.current = next; setDraft(next); };
  useEffect(() => {
    mounted.current = true; const unsubscribe = spendingAi.subscribe(value => { if (mounted.current) setAi(value); });
    const listener = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { mounted.current = false; cancel(); unsubscribe(); listener.remove(); };
  }, []);
  useEffect(() => { if (lock.locked || lock.covered) cancel(); }, [lock.locked, lock.covered]);
  useEffect(() => { stopElapsed(); if (waiting) { const started = waiting.started; elapsedTimer.current = setInterval(() => { if (mounted.current) setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000))); }, 1000); } return stopElapsed; }, [waiting?.started]);
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
    finally { active.current = false; controller.current = null; stopElapsed(); if (mounted.current) { setBusy(''); setWaiting(null); } }
  };
  const stateFor = (catalog: MealOption[]) => ({ ...latest.current.store.ledger, spending: { ...latest.current.store.ledger.spending, catalog: [...new Map([...latest.current.store.ledger.spending.catalog, ...catalog].map(m => [m.id, m])).values()] } });
  const guardVersion = (value: Draft | null) => { if (value?.expectedVersion !== null && value && latest.current.store.ledger.spending.plans.find(p => p.config.id === value.plan.config.id)?.version !== value.expectedVersion) throw new Error('Bản đã lưu đã thay đổi. Mở lại trước khi sửa.'); };
  const create = (withoutAi: boolean) => void operation('Đọc kho quán và món dự trù…', async request => {
    const current = latest.current.store, revision = current.revision, input = textRef.current, parsed = parseRoadmapPrompt(input, localDateKey(new Date().toISOString(), current.ledger.settings.timezone));
    assertRoadmapFoodSafety(input); guardVersion(draftRef.current);
    const thinks = !withoutAi && thinkMode, usesAi = thinks || (!withoutAi && !!parsed.preferenceText.trim());
    const started = Date.now();
    if (withoutAi && /khong|chi an|bat buoc|tranh|han che|tuan|lan|it nhat|toi da|dung\s*\d/.test(normalizeRoadmapText(parsed.preferenceText))) throw new Error('Bộ tính chưa duyệt được điều kiện ăn bắt buộc. Dùng AI local hoặc sửa mô tả chỉ gồm kỳ và ngân sách.');
    setElapsed(0); setWaiting({ step: 0, started, usesAi });
    controller.current = new AbortController(); const source = await loadRoadmapMeals(parsed.area, controller.current.signal); check(request, revision);
    setDiscovery({ venues: source.venues ?? [], pricedSources: [...new Set(source.meals.map(meal => meal.priceSource))], warnings: source.warnings }); setVenuesOpen(!source.meals.length);
    if (!source.meals.length) throw new Error(source.venues?.length ? `Tìm thấy ${source.venues.length} quán; chưa xác minh giá món. Xem thực đơn hoặc thử khu vực khác.` : 'Chưa có quán trong dữ liệu khu vực này. Ghi rõ quận/huyện và tỉnh/thành phố rồi thử lại.');
    setWaiting(value => value ? { ...value, step: 1 } : value);
    if (usesAi && !spendingAiAvailable) { setModelOpen(true); throw new Error('Đã đọc nguồn giá. AI local cần bản Sổ Ví trên iPhone để hiểu sở thích; có thể dùng bộ tính với mô tả không có điều kiện ăn bắt buộc.'); }
    if (usesAi && spendingAi.state.phase !== 'ready') {
      setBusy('Kiểm tra AI local…');
      try { const ready = await spendingAi.checkModel(); check(request, revision); if (!ready) throw new Error('Chưa có mô hình AI local. Tải hoặc nhập file trong phần thiết lập; quán tìm được vẫn được giữ.'); }
      catch (e) { check(request, revision); setModelOpen(true); throw e; }
    }
    // Cooked estimates join the menu only when cooking may be used: allowed by the user, or left open for the thinking planner.
    const mayCook = parsed.cooking === 'allow' || (thinks && parsed.cooking === 'unspecified');
    const catalog = mayCook ? source.meals : source.meals.filter(m => m.mode !== 'cook'); let preferences = emptyPreferences();
    let allowCooking = parsed.cooking === 'allow', thinking: Draft['thinking'];
    const old = draftRef.current; const config: PlanConfig = { id: old?.plan.config.id ?? newId(), name: parsed.area, startDay: parsed.startDay, endDay: parsed.endDay, timezone: current.ledger.settings.timezone, budget: parsed.budget, reserve: parsed.reserve, mealsPerDay: parsed.mealsPerDay, allowCooking, ...copy(scope), fixed: scope.fixed.map(f => ({ ...f, amount: parseMoneyInput(f.amount) })) };
    let plan: SpendingPlan | null = null, thinkingFellBack = false; const warnings = [...source.warnings];
    if (thinks) try {
      setBusy('AI local đang suy nghĩ… iPhone 12 Pro Max thường 2–6 phút, giữ app mở');
      const menu = thinkingMenu(parsed.area, catalog, meal => mealFitsSlot(meal, 0, 3)); let feedback: string | undefined, failure: unknown = null;
      // One repair round: the exact planner explains why the AI's idea does not fit, the AI rethinks once.
      for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
        const result = await spendingAi.think({ text: parsed.preferenceText, days: parsed.days, mealsPerDay: parsed.mealsPerDay, budget: parsed.budget, reserve: parsed.reserve, cooking: parsed.cooking, menu, feedback }, thinkingAliases(catalog)); check(request, revision);
        const proposed = restoreThinkingPreferences(result.preferences, catalog); reviewRoadmapPreferences(parsed.preferenceText, proposed, catalog, { suggestions: true });
        allowCooking = parsed.cooking === 'allow' || (parsed.cooking === 'unspecified' && result.allowCooking);
        setBusy('Bộ tính kiểm tra ý tưởng của AI…'); setWaiting(value => value ? { ...value, step: 2 } : value);
        try { plan = planSpending(stateFor(catalog), { ...config, allowCooking }, catalog, proposed, new Date().toISOString(), old?.plan); preferences = proposed; thinking = { tips: result.tips, reasoning: result.reasoning, attempts: attempt }; }
        catch (e) { failure = e; feedback = `Bộ tính không lập được lịch với đề xuất trước: ${errorMessage(e)} Hãy giảm ưu tiên/tần suất món đắt${parsed.cooking === 'deny' ? '' : ' hoặc dùng món tự nấu'} rồi trả lại JSON.`.slice(0, 500); if (attempt < 2) setBusy('AI suy nghĩ lại theo góp ý của bộ tính…'); }
      }
      if (!plan) throw failure;
    } catch (e) {
      // Out of time/tokens on this phone: keep the request and finish with the fast mode instead of failing.
      if (!isThinkingIncomplete(e)) throw e; check(request, revision); thinkingFellBack = true; allowCooking = parsed.cooking === 'allow';
      warnings.unshift('AI suy nghĩ chưa xong trong giới hạn của máy, nên lịch này dùng chế độ nhanh. Thử lại với mô tả ngắn hơn nếu muốn AI suy nghĩ.');
    }
    if (!plan && (!thinks || thinkingFellBack) && usesAi && parsed.preferenceText.trim()) {
      setBusy('AI local đọc sở thích…');
      const preferenceText = parsed.preferenceText || 'Không có sở thích hoặc tần suất. Trả về các danh sách rỗng.';
      const aiCatalog = roadmapAiCatalog(parsed.preferenceText, catalog);
      const proposed = await spendingAi.infer(preferenceText, roadmapAiAliases(aiCatalog), retrievedVenueContext(source.venues ?? []), aiCatalog.map(meal => dishNames(meal).filter(name => name !== normalizeRoadmapText(meal.name)).slice(0, 6)));
      check(request, revision); preferences = restoreRoadmapAiPreferences(proposed, aiCatalog); reviewRoadmapPreferences(parsed.preferenceText, preferences, catalog);
    } else if (parsed.preferenceText) {
      const clauses = normalizeRoadmapText(parsed.preferenceText).split(/[,;]/).map(v => v.trim()).filter(Boolean);
      for (const clause of clauses) {
        const match = clause.match(/^(?:thich|uu tien)\s+(.+)$/); if (!match) throw new Error('Bộ tính chỉ hiểu món thích theo tên nguồn; sửa mô tả hoặc dùng AI local.');
        const found = matchCatalogDishes(match[1], catalog); if (!found.length) throw new Error('Nguồn chưa có món được thích. Sửa mô tả hoặc dùng AI local.'); preferences.likedIds.push(...found.map(m => m.id));
      }
      preferences.likedIds = [...new Set(preferences.likedIds)];
    }
    check(request, revision); setBusy('Tính ngân sách chính xác…'); setWaiting(value => value ? { ...value, step: 2 } : value);
    if (!plan) {
      try { plan = planSpending(stateFor(catalog), { ...config, allowCooking }, catalog, preferences, new Date().toISOString(), old?.plan); }
      catch (e) {
        const minimum = parsed.cooking === 'unspecified' ? minimumEatOutCost(catalog, parsed.days, parsed.mealsPerDay, (meal, index) => mealFitsSlot(meal, index, parsed.mealsPerDay)) : null;
        if (minimum !== null && minimum > BigInt(parsed.budget) - BigInt(parsed.reserve)) throw new Error(`Ngân sách chưa đủ cho ${parsed.days * parsed.mealsPerDay} bữa ăn ngoài (cần ít nhất khoảng ${formatMoney(minimum.toString())}). Thêm “tự nấu được” vào mô tả, hoặc chọn “Suy nghĩ kỹ” để AI cân món tự nấu.`);
        throw e;
      }
    }
    check(request, revision); updateDraft({ plan, catalog, revision, expectedVersion: old?.expectedVersion ?? null, mode: usesAi && (!thinkingFellBack || parsed.preferenceText.trim()) ? 'ai' : 'math', warnings, text: input, thinking }); setReasoningOpen(false);
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
    const catalog = [...new Map([...plan.meals.map(m => m.meal), ...store.ledger.spending.catalog.filter(m => /^(?:online-|roadmap-estimate-)/.test(m.id))].map(m => [m.id, m])).values()];
    updateDraft({ plan: copy(plan), catalog, revision: latest.current.store.revision, expectedVersion: plan.version!, mode: 'saved', warnings: ['Ảnh chụp đã lưu, có thể cũ. Giá dự trù và giá nguồn cũ chưa được xác minh lại.'], text: input });
    setSelectedDay(plan.config.startDay); setWeek(0); setPromptOpen(false); setDirty(false); setDetail(''); setSwap(''); setError(''); pinned.current = null;
    setDiscovery(null); setVenuesOpen(false);
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
  const openMaps = (url: string) => { try { void openLink(assertGoogleMapsUrl(url)); } catch (e) { setError(errorMessage(e)); } };
  const findVenues = (slot: MealSlot) => void operation('Đang tìm quán phù hợp…', async request => {
    const key = keyOf(slot), area = draftRef.current?.plan.config.name; if (!area) return;
    setCandidates({ key, phase: 'loading', venues: [], error: '' }); controller.current = new AbortController();
    try {
      const venues = await loadFoodVenues({ area, dish: slot.meal.name, dishAliases: dishNames(slot.meal).slice(0, 8), limit: 5 }, controller.current.signal); check(request);
      setCandidates({ key, phase: 'ready', venues, error: '' });
    } catch (e) { check(request); setCandidates({ key, phase: 'error', venues: [], error: errorMessage(e) }); }
  });
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
  const venuePanel = discovery && <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Quán trong khu vực (${discovery.venues.length})`} accessibilityState={{ expanded: venuesOpen }} style={[styles.row, { minHeight: 44, paddingVertical: 8 }]} onPress={() => setVenuesOpen(value => !value)}><Icon name="restaurant-outline" /><Text style={[styles.secondary, { flex: 1 }]}>Kho quán · {discovery.venues.length} gợi ý khu vực</Text><Icon name={venuesOpen ? 'chevron-up' : 'chevron-down'} /></Pressable>
    {venuesOpen && <View style={{ gap: 10 }}>
      <Text selectable style={styles.helper}>{FOOD_NOTICE}</Text>
      <Text style={styles.helper}>Chọn chi tiết một bữa để tìm quán theo món. Tên và phân loại chưa chứng minh thực đơn.</Text>
      {discovery.warnings.map(warning => <Text key={warning} style={styles.helper}>{warning}</Text>)}
      <Button title="Nguồn & giấy phép Overture" secondary onPress={() => void openLink('https://docs.overturemaps.org/attribution/')} />
    </View>}
  </>;
  return <Page title="Roadmap ăn uống" back>
    {!!busy && <>
      {waiting ? <Card><Text style={styles.heading}>Đang tạo roadmap</Text><Text accessibilityLiveRegion="polite" style={styles.text}>{busy}</Text><Text accessibilityLiveRegion="none" style={[styles.secondary, { fontVariant: ['tabular-nums'] }]}>Đã chờ {elapsed} giây</Text>{['Tìm quán và món dự trù', waiting.usesAi ? (thinkMode ? 'Lên lịch · AI local suy nghĩ' : 'Lên lịch · AI local hiểu sở thích') : 'Lên lịch · bộ tính', 'Kiểm tra ngân sách'].map((label, index) => { const status = index < waiting.step ? 'Đã xong' : index === waiting.step ? 'Đang xử lý' : 'Chờ bước trước'; return <View key={label} accessibilityLabel={`${label}: ${status}`} style={styles.row}><Icon name={index < waiting.step ? 'checkmark-circle-outline' : index === waiting.step ? 'time-outline' : 'ellipse-outline'} color={index === waiting.step ? colors.accent : colors.secondary} /><View style={{ flex: 1 }}><Text style={styles.text}>{label}</Text><Text style={styles.secondary}>{status}</Text></View></View>; })}<Text style={styles.helper}>Thời gian phụ thuộc nguồn và mô hình trên máy. Hủy sẽ giữ mô tả và roadmap trước đó.</Text></Card> : <Text accessibilityLiveRegion="polite" style={styles.text}>{busy}</Text>}
      <Button title="Hủy thao tác" secondary disabled={busy === 'Đang lưu roadmap…'} onPress={cancel} />
    </>}
    {(!draft || promptOpen) ? <Card>
      <Text style={styles.heading}>Ăn gì, trong ngân sách của bạn</Text>
      <Field label="Mô tả roadmap" multiline value={text} maxLength={1000} placeholder="Quận 10, 7 ngày, 900k, 3 bữa/ngày" onChangeText={value => { if (!edit()) return; setDiscovery(null); setVenuesOpen(false); textRef.current = value; setText(value); }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Ví dụ mô tả" accessibilityState={{ expanded: help }} onPress={() => setHelp(v => !v)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[styles.secondary, { color: colors.accent }]}>Gợi ý mô tả {help ? '−' : '+'}</Text></Pressable>
      {help && <Text style={styles.helper}>Quận 10, 7 ngày, 900k, 3 bữa/ngày, thích cơm, không ăn phở. Hoặc ghi khu vực khác, ví dụ Ninh Kiều, Cần Thơ. Kho Overture tìm quán tại TP.HCM cũ. Lịch dùng giá dự trù món, chưa phải báo giá của quán. Dữ liệu có thể thiếu hoặc cũ. Chưa xác minh nguyên liệu/dị ứng.</Text>}
      <Choice label="Cách AI làm việc" items={[{ id: 'fast', name: 'Nhanh' }, { id: 'think', name: 'Suy nghĩ kỹ' }]} selected={[thinkMode ? 'think' : 'fast']} onSelect={id => { if (!edit()) return; setThinkMode(id === 'think'); }} />
      <Text style={styles.helper}>{thinkMode ? 'Qwen tự cân ngân sách, đa dạng món và tự nấu khi cần · iPhone 12 Pro Max thường 2–6 phút, giữ app mở. Quá giới hạn thì tự chuyển sang chế độ nhanh. Bộ tính vẫn kiểm từng đồng.' : 'Qwen local hiểu sở thích · bộ tính giữ số tiền VND chính xác.'} Ghi “tự nấu được” hoặc “không nấu” nếu muốn.</Text>
      <Button title="Tạo roadmap" disabled={!!busy || aiBusy || !text.trim()} onPress={() => create(false)} />
    </Card> : <Button title="Sửa mô tả" secondary icon="create-outline" onPress={() => setPromptOpen(true)} />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!discovery?.pricedSources.length && venuePanel}
    {!!ai.error && <Text accessibilityRole="alert" style={styles.error}>{ai.error}</Text>}
    {!busy && !draft && <Text style={styles.helper}>{!spendingAiAvailable ? 'AI local cần bản iPhone riêng.' : `AI local: ${aiPhase}.`}</Text>}
    {!discovery?.pricedSources.length && draft?.warnings.map(warning => <Text key={warning} style={styles.advisory}>{warning}</Text>)}
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
      {draft.thinking && <Card>
        <Text style={styles.heading}>AI đã suy nghĩ</Text>
        {draft.thinking.tips.map(tip => <Text key={tip} selectable style={styles.text}>• {tip}</Text>)}
        {!draft.thinking.tips.length && <Text style={styles.secondary}>AI không để lại lời khuyên; lịch vẫn theo đề xuất của AI.</Text>}
        <Text style={styles.helper}>{plan.config.allowCooking ? 'Có dùng món tự nấu · giá nguyên liệu là dự trù. ' : ''}{draft.thinking.attempts > 1 ? 'AI đã sửa một lần theo góp ý của bộ tính. ' : ''}Lời khuyên không được lưu cùng lịch.</Text>
        {!!draft.thinking.reasoning && <><Pressable accessibilityRole="button" accessibilityLabel="Quá trình suy nghĩ của AI" accessibilityState={{ expanded: reasoningOpen }} onPress={() => setReasoningOpen(v => !v)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[styles.secondary, { color: colors.accent }]}>Xem AI đã nghĩ gì {reasoningOpen ? '−' : '+'}</Text></Pressable>
        {reasoningOpen && <Text selectable style={styles.helper}>{draft.thinking.reasoning}</Text>}</>}
      </Card>}
      <Choice label="Xem roadmap" items={[{ id: 'day', name: 'Theo ngày' }, { id: 'week', name: 'Theo tuần' }]} selected={[view]} onSelect={setView} />
      {days.length > 7 && <Choice label="Tuần đang xem" dropdown items={Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => ({ id: String(i), name: `Tuần ${i + 1} · ${days[i * 7]}` }))} selected={[String(week)]} onSelect={id => { setWeek(Number(id)); setSelectedDay(days[Number(id) * 7]); }} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>{weekDays.map(day => <Pressable key={day} accessibilityRole="button" accessibilityLabel={`Ngày ${day}`} accessibilityState={{ selected: day === selectedDay }} onPress={() => { setSelectedDay(day); setView('day'); setSwap(''); setDetail(''); }} style={[styles.chip, day === selectedDay && { borderColor: colors.accent, backgroundColor: colors.raised }]}><Text style={styles.text}>{day.slice(8)}/{day.slice(5, 7)}</Text><Text style={styles.secondary}>{day === selectedDay ? 'Đang chọn' : day === today ? 'Hôm nay' : ' '}</Text></Pressable>)}</ScrollView>
      {view === 'week' ? <Card>{weekDays.map(day => {
        const meals = plan.meals.filter(m => m.day === day), total = meals.reduce((n, m) => n + BigInt(m.meal.price), 0n);
        const times = suggestedTimes(plan.config.mealsPerDay), span = times.length === 1 ? times[0] : `${times[0]}–${times[times.length - 1]}`;
        return <Pressable key={day} accessibilityRole="button" accessibilityLabel={`Xem ngày ${day}, giờ dự kiến ${span}, ${formatMoney(total)}`} onPress={() => { setSelectedDay(day); setView('day'); }} style={[styles.spread, { flexWrap: 'wrap', minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }]}><View style={{ gap: 4 }}><View style={[styles.row, { gap: 6 }]}><Text style={styles.text}>{day.slice(8)}/{day.slice(5, 7)}</Text>{meals.map(m => <Image key={m.index} accessible={false} source={dishImage(m.meal)} style={{ width: 28, height: 28 }} />)}</View><Text style={[styles.secondary, { fontVariant: ['tabular-nums'] }]}>Giờ dự kiến {span}</Text></View><Text style={styles.metricVal}>{formatMoney(total)}</Text></Pressable>;
      })}</Card> : <><Text style={styles.secondary}>Giờ dự kiến · gợi ý theo bữa</Text><View style={styles.timeline}>{plan.meals.filter(m => m.day === selectedDay).map(slot => {
        const key = keyOf(slot), protectedMeal = protectedSlot(slot, today);
        const persisted = store.ledger.spending.plans.find(p => p.config.id === plan.config.id)?.meals.find(m => keyOf(m) === key);
        const savedProtected = !!persisted && protectedSlot(persisted, today);
        const candidates = swap === key && !protectedMeal ? draft.catalog.filter(m => m.id !== slot.meal.id && !plan.preferences.excludedIds.includes(m.id)).flatMap(meal => {
          try { return [{ meal, replacement: replaceMeal(stateFor(draft.catalog), plan, slot.day, slot.index, meal.id, draft.catalog, plan.preferences, new Date().toISOString()) }]; }
          catch { return []; }
        }).slice(0, 6) : [];
        return <View key={key} style={{ gap: 8 }}><View accessible={false} style={[styles.timelineNode, { width: 24, height: 24, left: -30 }]}><Text style={styles.badgeText}>{slot.index + 1}</Text></View><Card>
          <View style={[styles.row, { alignItems: 'flex-start' }]}><Image accessible={false} source={dishImage(slot.meal)} style={{ width: 64, height: 64 }} /><View style={{ flex: 1, gap: 4 }}><Text style={[styles.secondary, { fontVariant: ['tabular-nums'] }]}>{suggestedTimes(plan.config.mealsPerDay)[slot.index]} · Bữa {slot.index + 1}{slot.completed ? ' · Đã ăn' : slot.locked ? ' · Đã khóa' : ''}</Text><Text style={styles.heading}>{slot.meal.name}</Text><Text numberOfLines={1} style={styles.secondary}>{slot.meal.portion.replace(/^1 phần · /, '')}</Text>{!!slot.meal.address && <Text numberOfLines={1} accessibilityLabel={slot.meal.address} style={styles.helper}>{slot.meal.address.split(',').slice(0, 2).map(part => part.trim()).join(', ')}</Text>}<Text style={styles.amount}>{formatMoney(slot.meal.price)}</Text></View></View>
          <View style={styles.pair}><View style={styles.half}><Button title={`Đổi bữa ${slot.index + 1}`} secondary disabled={protectedMeal || !!busy || aiBusy} onPress={() => { setSwap(swap === key ? '' : key); setDetail(''); }} /></View><View style={styles.half}><Button title={`Chi tiết bữa ${slot.index + 1}`} secondary disabled={!!busy} onPress={() => { const opening = detail !== key; setDetail(opening ? key : ''); setSwap(''); if (opening && !isCookedEstimate(slot.meal)) findVenues(slot); }} /></View></View>
          {detail === key && <>
            <Text style={styles.helper}>Giờ dự kiến là gợi ý; kiểm tra giờ mở cửa của quán trước khi đi.</Text>
            {isCookedEstimate(slot.meal) ? null : isPlanningEstimate(slot.meal) ? <Text selectable style={styles.advisory}>Dự trù món {formatMoney(slot.meal.price)} · chưa xác minh giá tại quán. Kho quán không có dữ liệu giá.</Text> : <><Text selectable style={styles.text}>{slot.meal.address || 'Chưa có địa chỉ'}</Text><Text style={styles.helper}>Đọc nguồn {slot.meal.pricedAt} · giá trong lịch đã lưu có thể cũ; không chứng minh giá tại quán gợi ý.</Text><Text selectable style={styles.secondary}>{slot.meal.priceSource}</Text>{/^https:\/\//.test(slot.meal.priceSource) && <Button title="Mở nguồn giá" secondary onPress={() => void openLink(slot.meal.priceSource)} />}</>}
            {isCookedEstimate(slot.meal) ? <><Text style={styles.heading}>Tự nấu</Text><Text selectable style={styles.text}>Nguyên liệu gợi ý: {cookedIngredients(slot.meal)}</Text><Text style={styles.helper}>Giá {formatMoney(slot.meal.price)} là dự trù nguyên liệu chợ cho một phần, chưa xác minh.</Text></> : <>
            <Text style={styles.heading}>Quán gợi ý cho {slot.meal.name}</Text>
            {(() => { const signal = localDishSignal(plan.config.name, slot.meal); return signal && <Text style={styles.secondary}>{signal.venues ? `Kho có ${signal.venues} quán ở khu vực này đặt tên theo món (tín hiệu tên, chưa xác minh thực đơn).` : 'Kho chưa có quán ở khu vực này đặt tên theo món; thử tìm trên Google Maps.'}</Text>; })()}
            {venueResults?.key !== key && <Button title="Tìm quán cho món này" secondary disabled={!!busy} onPress={() => findVenues(slot)} />}
            {venueResults?.key === key && venueResults.phase === 'loading' && <Text accessibilityLiveRegion="polite" style={styles.secondary}>Đang tìm quán trong kho…</Text>}
            {venueResults?.key === key && venueResults.phase === 'error' && <><Text accessibilityRole="alert" style={styles.error}>{venueResults.error}</Text><Button title="Thử tìm quán lại" secondary disabled={!!busy} onPress={() => findVenues(slot)} /></>}
            {venueResults?.key === key && venueResults.phase === 'ready' && !venueResults.venues.length && <Text style={styles.advisory}>Chưa có quán khớp món và khu vực trong kho. Thử tìm món trên Google Maps.</Text>}
            {venueResults?.key === key && venueResults.venues.map(venue => <View key={venue.key} style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text selectable style={styles.heading}>{venue.name}</Text><Text selectable style={styles.secondary}>{venue.address}</Text>
              {venue.distanceKm !== undefined && <Text style={styles.secondary}>Cách vị trí đã chọn {venue.distanceKm.toFixed(1)} km</Text>}
              <Text style={styles.advisory}>{venueEvidence(venue)}</Text><Text style={styles.helper}>Nguồn {venue.source} · release {venue.release} · {JSON.parse(venue.licenses).join(', ')}</Text>
              <Button title="Mở Google Maps" accessibilityLabel={`Mở Google Maps · ${venue.name}`} secondary onPress={() => openMaps(venueMapsUrl(venue))} />
            </View>)}
            <Button title={`Tìm ${slot.meal.name} trên Google Maps`} secondary onPress={() => openMaps(googleMapsSearch(`${slot.meal.name} ${plan.config.name}`))} /></>}
            <Text style={styles.helper}>{FOOD_NOTICE} Nguyên liệu/dị ứng chưa xác nhận.</Text>
            {slot.day >= today && !savedProtected && <><Button title={slot.locked ? 'Bỏ khóa bữa' : 'Khóa bữa'} secondary disabled={!!busy} onPress={() => changePlan({ ...plan, meals: plan.meals.map(m => keyOf(m) === key ? { ...m, locked: !m.locked } : m) })} /><Button title={slot.completed ? 'Bỏ xác nhận đã ăn' : 'Xác nhận đã ăn'} secondary disabled={!!busy} onPress={() => changePlan({ ...plan, meals: plan.meals.map(m => keyOf(m) === key ? { ...m, completed: !m.completed } : m) })} /><Choice label={`Chi đã ghi sổ cho bữa ${slot.index + 1}`} dropdown items={[{ id: '', name: 'Chưa liên kết' }, ...store.ledger.transactions.filter(t => t.kind === 'expense').map(t => ({ id: t.id, name: `${t.note || 'Khoản chi'} · ${formatMoney(t.amount)}` }))]} selected={[slot.transactionId ?? '']} onSelect={id => changePlan({ ...plan, meals: plan.meals.map(m => keyOf(m) === key ? { ...m, transactionId: id || null } : m) })} /></>}
          </>}
          {swap === key && !protectedMeal && <>
            <Text style={styles.helper}>Đổi một bữa, giữ các bữa khác. Cân lại giữ món vừa chọn và các bữa được bảo vệ.</Text>
            {candidates.map(({ meal, replacement }) => {
              let allowed = true; try { validatePlanSave(stateFor(draft.catalog), replacement.plan, new Date().toISOString(), store.ledger.spending.plans.find(p => p.config.id === plan.config.id)); } catch { allowed = false; }
              return <View key={meal.id} style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}><View style={styles.row}><Image accessible={false} source={dishImage(meal)} style={{ width: 36, height: 36 }} /><Text style={[styles.text, { flex: 1 }]}>{meal.name}</Text></View><Text style={styles.secondary}>{formatMoney(meal.price)} · chênh {BigInt(replacement.delta) > 0n ? '+' : ''}{formatMoney(replacement.delta)} · còn {formatMoney(replacement.remaining)}</Text><Button title={`Chọn ${meal.name}`} secondary disabled={!allowed || !!busy} onPress={() => { changePlan(replacement.plan); pinned.current = key; setSwap(''); }} />{!allowed && <Button title={`Chọn & cân lại ${meal.name}`} secondary disabled={!!busy} onPress={() => rebalance({ day: slot.day, index: slot.index, id: meal.id })} />}</View>;
            })}
          </>}
        </Card></View>;
      })}</View></>}
      {dirty && <Button title="Lưu roadmap" disabled={!canSave} onPress={save} />}
      <Pressable accessibilityRole="button" accessibilityLabel="Duyệt & sửa sở thích" accessibilityState={{ expanded: conditions }} onPress={() => setConditions(v => !v)} style={[styles.row, { minHeight: 44, paddingVertical: 8 }]}><Icon name="options-outline" /><Text style={[styles.secondary, { flex: 1 }]}>Sở thích ăn uống</Text><Icon name={conditions ? 'chevron-up' : 'chevron-down'} /></Pressable>
      {conditions && <Card><Text style={styles.heading}>{draft.mode === 'math' ? 'Điều kiện bộ tính' : 'Sở thích đang duyệt'}</Text><Text style={styles.secondary}>Thích: {plan.preferences.likedIds.map(id => draft.catalog.find(m => m.id === id)?.name ?? id).join(', ') || 'chưa chọn'}{`\n`}Không ăn: {plan.preferences.excludedIds.map(id => draft.catalog.find(m => m.id === id)?.name ?? id).join(', ') || 'chưa chọn'}</Text><Choice label="Món thích" dropdown multiple items={draft.catalog} selected={plan.preferences.likedIds} onSelect={id => changePreferences({ ...plan.preferences, likedIds: toggle(plan.preferences.likedIds, id) })} /><Choice label="Món không ăn" dropdown multiple items={draft.catalog} selected={plan.preferences.excludedIds} onSelect={id => changePreferences({ ...plan.preferences, excludedIds: toggle(plan.preferences.excludedIds, id) })} />{plan.preferences.frequency.map(f => <View key={f.mealId} style={{ gap: 8 }}><Text style={styles.text}>{draft.catalog.find(m => m.id === f.mealId)?.name}</Text><View style={styles.pair}><View style={styles.half}><Field label="Ít nhất / 7 ngày" keyboardType="number-pad" value={String(f.min)} onChangeText={v => changePreferences({ ...plan.preferences, frequency: plan.preferences.frequency.map(x => x.mealId === f.mealId ? { ...x, min: Number(v) } : x) })} /></View><View style={styles.half}><Field label="Tối đa / 7 ngày" keyboardType="number-pad" value={String(f.max)} onChangeText={v => changePreferences({ ...plan.preferences, frequency: plan.preferences.frequency.map(x => x.mealId === f.mealId ? { ...x, max: Number(v) } : x) })} /></View></View></View>)}<Text style={styles.helper}>Dị ứng/nguyên liệu chưa xác nhận: roadmap không chứng nhận an toàn ăn uống.</Text></Card>}
      <Button title="Cân lại ngân sách" secondary disabled={!!busy || aiBusy} onPress={() => rebalance()} />
    </>}
    {!!discovery?.pricedSources.length && draft?.warnings.map(warning => <Text key={warning} style={styles.advisory}>{warning}</Text>)}
    {!!discovery?.pricedSources.length && venuePanel}
    <Pressable accessibilityRole="button" accessibilityLabel="Kế hoạch đã lưu & phạm vi chi" accessibilityState={{ expanded: advanced }} onPress={() => setAdvanced(v => !v)} style={[styles.row, { minHeight: 44, paddingVertical: 8 }]}><Icon name="wallet-outline" /><Text style={[styles.secondary, { flex: 1 }]}>Đã lưu & phạm vi chi</Text><Icon name={advanced ? 'chevron-up' : 'chevron-down'} /></Pressable>
    {advanced && <Card>
      <Choice label="Mở roadmap đã lưu" dropdown items={store.ledger.spending.plans.map(p => ({ id: p.config.id, name: `${p.config.name} · ${p.config.startDay}` }))} selected={plan ? [plan.config.id] : []} onSelect={id => openGuarded(store.ledger.spending.plans.find(p => p.config.id === id)!)} />
      <View style={styles.pair}><View accessibilityLabel="Ví · bỏ trống = tất cả" style={styles.half}><Choice label="Ví" dropdown multiple items={store.ledger.wallets} selected={scope.walletIds} onSelect={id => setScopeField('walletIds', toggle(scope.walletIds, id))} /></View><View accessibilityLabel="Danh mục chi · bỏ trống = tất cả" style={styles.half}><Choice label="Danh mục chi" dropdown multiple items={store.ledger.categories.filter(c => c.kind === 'expense')} selected={scope.categoryIds} onSelect={id => setScopeField('categoryIds', toggle(scope.categoryIds, id))} /></View></View>
      <Text style={styles.helper}>Bỏ trống ví hoặc danh mục = tất cả.</Text>
      <Text style={styles.helper}>Đã chi theo phạm vi được trừ tự động. Khoản cố định chưa chi có thể liên kết giao dịch để tránh trừ hai lần.</Text>
      {scope.fixed.map((fixed, i) => <View key={fixed.id} style={{ gap: 8 }}><Field label={`Tên khoản cố định ${i + 1}`} value={fixed.name} onChangeText={v => setScopeField('fixed', scope.fixed.map(f => f.id === fixed.id ? { ...f, name: v } : f))} /><Field label={`Tiền khoản cố định ${i + 1}`} keyboardType="number-pad" value={fixed.amount} onChangeText={v => setScopeField('fixed', scope.fixed.map(f => f.id === fixed.id ? { ...f, amount: v } : f))} /><Choice label={`Liên kết khoản cố định ${i + 1}`} dropdown items={[{ id: '', name: 'Chưa chi' }, ...store.ledger.transactions.filter(t => t.kind === 'expense').map(t => ({ id: t.id, name: `${t.note || 'Khoản chi'} · ${formatMoney(t.amount)}` }))]} selected={[fixed.transactionId ?? '']} onSelect={id => setScopeField('fixed', scope.fixed.map(f => f.id === fixed.id ? { ...f, transactionId: id || null } : f))} /><Button title={`Bỏ khoản ${i + 1}`} secondary onPress={() => setScopeField('fixed', scope.fixed.filter(f => f.id !== fixed.id))} /></View>)}
      <Button title="Thêm khoản cố định" secondary disabled={scope.fixed.length >= 100} onPress={() => setScopeField('fixed', [...scope.fixed, { id: newId(), name: '', amount: '', transactionId: null }])} />
      {draft && <Button title="Roadmap mới" secondary disabled={!!busy || aiBusy} onPress={() => { if (!edit()) return; setDiscovery(null); setVenuesOpen(false); draftRef.current = null; setDraft(null); setPromptOpen(true); pinned.current = null; }} />}
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
      <Text style={styles.helper}>Bộ tính dùng món và giá dự trù, không dùng AI. Điều kiện ăn bắt buộc cần AI local duyệt; không tự bỏ điều kiện.</Text>
      <Button title="Tạo bằng bộ tính" secondary disabled={!!busy || aiBusy || !text.trim()} onPress={() => create(true)} />
    </Card>}
  </Page>;
}
