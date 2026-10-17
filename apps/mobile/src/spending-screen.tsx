import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Text, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { formatMoney, localDateKey, parseMoneyInput, type Command } from './domain';
import { errorMessage, newId, useLedger } from './store';
import { useAppLock } from './app-lock';
import { Button, Card, Choice, Empty, Field, Page, styles, toggle } from './ui';
import { planSpending, protectedSlot, replaceMeal, spendingTotals, validatePreferences, type MealOption, type PlanConfig, type Preferences, type SpendingPlan } from './spending';
import { SPENDING_MODEL, spendingAi, spendingAiAvailable, type AiState } from './spending-ai';

type Preview = { plan: SpendingPlan; revision: number; expectedVersion: number | null; message: string };
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function blankMeal(today: string): MealOption { return { id: newId(), name: '', price: '', portion: '1 bữa', mode: 'out', address: '', priceSource: 'Giá do tôi nhập', pricedAt: today, estimated: true, allergens: [] }; }
export function SpendingScreen() {
  const store = useLedger(); const lock = useAppLock(); const navigation = useNavigation(); const today = localDateKey(new Date().toISOString(), store.ledger.settings.timezone);
  const [panel, setPanel] = useState('config'); const [config, setConfig] = useState<PlanConfig>(() => ({ id: newId(), name: 'Ăn uống', startDay: today, endDay: today, timezone: store.ledger.settings.timezone, budget: '', reserve: '0', walletIds: [], categoryIds: [], mealsPerDay: 3, allowCooking: true, fixed: [] }));
  const [meal, setMeal] = useState(() => blankMeal(today)); const [preferences, setPreferences] = useState<Preferences>(() => copy(store.ledger.spending.preferences));
  const [saved, setSaved] = useState<SpendingPlan | null>(null); const [preview, setPreview] = useState<Preview | null>(null); const [aiPreview, setAiPreview] = useState<{ preferences: Preferences; catalog: string; text: string; draftRevision: number } | null>(null);
  const [preferenceText, setPreferenceText] = useState(''); const [ai, setAi] = useState<AiState>(spendingAi.state); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [dirty, setDirty] = useState(false);
  const mounted = useRef(true); const saving = useRef(false); const latest = useRef(store); latest.current = store; const aiBusy = !['ready', 'missing', 'error'].includes(ai.phase);
  const swapPinned = useRef<{ day: string; index: number } | null>(null);
  const draftRevision = useRef(0); const latestText = useRef(preferenceText); latestText.current = preferenceText; const latestConfig = useRef(config); latestConfig.current = config;
  const invalidateAi = () => { draftRevision.current++; setAiPreview(null); };
  const shown = preview?.plan ?? saved; const isStale = !!preview && preview.revision !== store.revision; const now = new Date().toISOString();
  useEffect(() => { mounted.current = true; const unsubscribe = spendingAi.subscribe(state => { if (mounted.current) setAi(state); }); const sub = AppState.addEventListener('change', state => { if (state !== 'active') { invalidateAi(); void spendingAi.cancel(); } }); return () => { mounted.current = false; draftRevision.current++; unsubscribe(); sub.remove(); void spendingAi.cancel(); }; }, []);
  useEffect(() => { if (lock.locked) { invalidateAi(); void spendingAi.cancel(); } }, [lock.locked]);
  usePreventRemove(dirty || busy || aiBusy, ({ data }) => { if (busy || aiBusy) { Alert.alert('Đang xử lý', 'Hủy AI hoặc chờ lưu hoàn tất. Bản nháp được giữ.'); return; } Alert.alert('Bỏ bản nháp?', 'Những thay đổi chưa lưu sẽ bị bỏ.', [{ text: 'Tiếp tục sửa', style: 'cancel' }, { text: 'Bỏ bản nháp', style: 'destructive', onPress: () => { try { lock.assertUnlocked(); navigation.dispatch(data.action); } catch (e) { setError(errorMessage(e)); } } }]); });
  const edit = () => { invalidateAi(); setDirty(true); setPreview(null); swapPinned.current = null; setError(''); };
  const setConfigField = <K extends keyof PlanConfig>(key: K, value: PlanConfig[K]) => { edit(); latestConfig.current = { ...latestConfig.current, [key]: value }; setConfig(c => ({ ...c, [key]: value })); };
  const setMealField = <K extends keyof MealOption>(key: K, value: MealOption[K]) => { invalidateAi(); setDirty(true); setError(''); setMeal(m => ({ ...m, [key]: value })); };
  const setPreference = (next: Preferences) => { edit(); setPreferences(next); };
  const action = async (fn: () => Promise<void>) => { if (saving.current) return; saving.current = true; setBusy(true); setError(''); try { lock.assertUnlocked(); await fn(); } catch (e) { if (mounted.current) setError(errorMessage(e)); } finally { saving.current = false; if (mounted.current) setBusy(false); } };
  const write = (command: Command, revision = latest.current.revision) => latest.current.execute(command, revision);
  const open = (p: SpendingPlan) => { invalidateAi(); latestConfig.current = copy(p.config); setSaved(copy(p)); setConfig(copy(p.config)); setPreferences(copy(p.preferences)); setPreview(null); swapPinned.current = null; setError(''); setPanel('plan'); setDirty(false); };
  const openGuarded = (p: SpendingPlan) => { if (!dirty) { open(p); return; } Alert.alert('Mở kế hoạch đã lưu?', 'Bản nháp hiện tại sẽ bị bỏ.', [{ text: 'Giữ bản nháp', style: 'cancel' }, { text: 'Mở', onPress: () => { try { lock.assertUnlocked(); open(p); } catch (e) { setError(errorMessage(e)); } } }]); };
  const build = () => { try { lock.assertUnlocked(); const current = latest.current; if (saved && current.ledger.spending.plans.find(p => p.config.id === saved.config.id)?.version !== saved.version) throw new Error('Kế hoạch đã thay đổi. Mở lại bản đã lưu trước khi tạo đề xuất.'); const normalized = { ...config, budget: parseMoneyInput(config.budget), reserve: parseMoneyInput(config.reserve), fixed: config.fixed.map(f => ({ ...f, amount: parseMoneyInput(f.amount) })) }; const previous = shown ? copy(shown) : undefined; const pinned = swapPinned.current; const pinnedSlot = previous?.meals.find(m => pinned && m.day === pinned.day && m.index === pinned.index); const oldLock = pinnedSlot?.locked; if (pinnedSlot) pinnedSlot.locked = true; const plan = planSpending(current.ledger, normalized, current.ledger.spending.catalog, preferences, new Date().toISOString(), previous); if (pinnedSlot) plan.meals.find(m => m.day === pinnedSlot.day && m.index === pinnedSlot.index)!.locked = oldLock!; invalidateAi(); setPreview({ plan, revision: current.revision, expectedVersion: saved?.version ?? null, message: shown ? 'Cân lại phần chưa khóa và chưa xác nhận. Món vừa đổi và các bữa đã qua được giữ nguyên.' : 'Đề xuất mới, chưa ghi giao dịch.' }); setPanel('plan'); setDirty(true); setError(''); } catch (e) { setError(errorMessage(e)); } };
  const savePlan = () => action(async () => { if (!preview) return; if (preview.revision !== latest.current.revision) throw new Error('Sổ đã thay đổi. Tạo lại đề xuất để kiểm tra số dư mới.'); const requestRevision = draftRevision.current; const result = await write({ type: 'spending.plan.upsert', mutationId: newId(), payload: { plan: preview.plan, expectedVersion: preview.expectedVersion } }, preview.revision); if (mounted.current) { const persisted = result.ledger.spending.plans.find(p => p.config.id === preview.plan.config.id)!; if (requestRevision === draftRevision.current) open(persisted); else if (latestConfig.current.id === persisted.config.id) { setSaved(copy(persisted)); } } });
  const propose = (plan: SpendingPlan, message: string) => { lock.assertUnlocked(); if (preview && isStale) throw new Error('Đề xuất đã cũ. Tạo lại trước khi sửa bữa.'); if (saved && latest.current.ledger.spending.plans.find(p => p.config.id === saved.config.id)?.version !== saved.version) throw new Error('Kế hoạch đã thay đổi. Mở lại trước khi sửa bữa.'); invalidateAi(); setPreview({ plan, revision: preview?.revision ?? latest.current.revision, expectedVersion: saved?.version ?? null, message }); setDirty(true); setError(''); };
  const changeSlot = (day: string, index: number, change: { locked?: boolean; completed?: boolean; transactionId?: string | null }) => { try { if (!shown) return; const plan = copy(shown); const slot = plan.meals.find(m => m.day === day && m.index === index)!; if (protectedSlot(slot, localDateKey(new Date().toISOString(), plan.config.timezone))) throw new Error('Bữa đã qua, khóa hoặc xác nhận được giữ nguyên.'); Object.assign(slot, change); propose(plan, 'Xem thay đổi rồi lưu kế hoạch. Xác nhận bữa không ghi giao dịch.'); } catch (e) { setError(errorMessage(e)); } };
  const swap = (day: string, index: number, id: string) => { try { if (!shown) return; const result = replaceMeal(latest.current.ledger, shown, day, index, id, latest.current.ledger.spending.catalog, shown.preferences, new Date().toISOString()); propose(result.plan, `Đổi ${formatMoney(result.oldPrice)} → ${formatMoney(result.newPrice)} · chênh ${formatMoney(result.delta)} · còn cuối kỳ ${formatMoney(result.remaining)}. Các bữa khác giữ nguyên; dự phòng không đổi.`); swapPinned.current = { day, index }; } catch (e) { setError(errorMessage(e)); } };
  let totals: ReturnType<typeof spendingTotals> | null = null; let totalsError = ''; if (shown) { try { totals = spendingTotals(store.ledger, shown, now); } catch (e) { totalsError = errorMessage(e); } }
  const expenseItems = [{ id: '', name: 'Chưa liên kết khoản đã chi' }, ...store.ledger.transactions.filter(t => t.kind === 'expense').map(t => ({ id: t.id, name: `${localDateKey(t.occurredAt, store.ledger.settings.timezone)} · ${t.note || store.ledger.categories.find(c => c.id === t.categoryId)?.name} · ${formatMoney(t.amount)}` }))];
  return <Page title="AI chi tiêu" back>
    <Choice label="Phần đang xem" items={[{ id: 'config', name: 'Kỳ & sở thích' }, { id: 'menu', name: 'Thực đơn' }, { id: 'plan', name: 'Kế hoạch' }, { id: 'model', name: 'AI local' }]} selected={[panel]} onSelect={setPanel} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {panel === 'config' && <>
      <Card><Text style={styles.heading}>Kỳ ngân sách</Text><Field label="Tên kế hoạch" value={config.name} maxLength={200} onChangeText={v => setConfigField('name', v)} /><View style={styles.pair}><View style={styles.half}><Field label="Từ ngày YYYY-MM-DD" value={config.startDay} onChangeText={v => setConfigField('startDay', v)} /></View><View style={styles.half}><Field label="Đến ngày YYYY-MM-DD" value={config.endDay} onChangeText={v => setConfigField('endDay', v)} /></View></View><Text style={styles.helper}>Tối đa 31 ngày · {config.timezone}</Text><View style={styles.pair}><View style={styles.half}><Field label="Ngân sách VND" keyboardType="number-pad" value={config.budget} onChangeText={v => setConfigField('budget', v)} /></View><View style={styles.half}><Field label="Dự phòng VND" keyboardType="number-pad" value={config.reserve} onChangeText={v => setConfigField('reserve', v)} /></View></View><Choice label="Số bữa mỗi ngày" items={[1, 2, 3].map(n => ({ id: String(n), name: `${n} bữa` }))} selected={[String(config.mealsPerDay)]} onSelect={v => setConfigField('mealsPerDay', Number(v))} /><Choice label="Có thể tự nấu" items={[{ id: 'yes', name: 'Có, tự nấu' }, { id: 'no', name: 'Chỉ ăn quán' }]} selected={[config.allowCooking ? 'yes' : 'no']} onSelect={v => setConfigField('allowCooking', v === 'yes')} /><Choice label="Ví (không chọn = tất cả)" dropdown multiple items={store.ledger.wallets} selected={config.walletIds} onSelect={id => setConfigField('walletIds', toggle(config.walletIds, id))} /><Choice label="Danh mục chi (không chọn = tất cả)" dropdown multiple items={store.ledger.categories.filter(c => c.kind === 'expense')} selected={config.categoryIds} onSelect={id => setConfigField('categoryIds', toggle(config.categoryIds, id))} /></Card>
      <Card><Text style={styles.heading}>Khoản cố định chưa chi</Text><Text style={styles.helper}>Liên kết giao dịch chi trong kỳ/phạm vi để không trừ hai lần. Liên kết ngoài phạm vi hoặc đã xóa vẫn dự trù khoản cố định.</Text>{config.fixed.map((f, i) => <View key={f.id} style={{ gap: 8 }}><Field label={`Tên khoản ${i + 1}`} value={f.name} onChangeText={v => setConfigField('fixed', config.fixed.map(x => x.id === f.id ? { ...x, name: v } : x))} /><Field label={`Số tiền khoản ${i + 1}`} keyboardType="number-pad" value={f.amount} onChangeText={v => setConfigField('fixed', config.fixed.map(x => x.id === f.id ? { ...x, amount: v } : x))} /><Choice label={`Khoản ${i + 1} đã ghi sổ`} dropdown items={expenseItems} selected={[f.transactionId ?? '']} onSelect={id => setConfigField('fixed', config.fixed.map(x => x.id === f.id ? { ...x, transactionId: id || null } : x))} /><Button title={`Bỏ khoản ${i + 1}`} secondary onPress={() => setConfigField('fixed', config.fixed.filter(x => x.id !== f.id))} /></View>)}<Button title="Thêm khoản cố định" secondary disabled={config.fixed.length >= 100} onPress={() => setConfigField('fixed', [...config.fixed, { id: newId(), name: '', amount: '', transactionId: null }])} /></Card>
      <Card><Text style={styles.heading}>Sở thích đang duyệt</Text><Choice label="Món thích (ưu tiên mềm)" dropdown multiple items={store.ledger.spending.catalog} selected={preferences.likedIds} onSelect={id => setPreference({ ...preferences, likedIds: toggle(preferences.likedIds, id) })} /><Choice label="Món không ăn (bắt buộc)" dropdown multiple items={store.ledger.spending.catalog} selected={preferences.excludedIds} onSelect={id => setPreference({ ...preferences, excludedIds: toggle(preferences.excludedIds, id) })} /><Field label="Dị ứng / nguyên liệu loại trừ, cách bằng dấu phẩy" value={preferences.excludedAllergens.join(', ')} onChangeText={v => setPreference({ ...preferences, excludedAllergens: v.split(',').map(x => x.trim()).filter(Boolean) })} /><Text style={styles.helper}>Tần suất tính mỗi 7 ngày từ đầu kỳ; tuần ngắn làm tròn tối thiểu lên, tối đa xuống. Thích món không tự tạo số lần.</Text>{preferences.frequency.map(f => <View key={f.mealId} style={{ gap: 8 }}><Text style={styles.text}>{store.ledger.spending.catalog.find(m => m.id === f.mealId)?.name ?? f.mealId}</Text><View style={styles.pair}><View style={styles.half}><Field label={`Ít nhất / 7 ngày · ${f.mealId}`} keyboardType="number-pad" value={String(f.min)} onChangeText={v => setPreference({ ...preferences, frequency: preferences.frequency.map(x => x.mealId === f.mealId ? { ...x, min: v === '' ? NaN : Number(v) } : x) })} /></View><View style={styles.half}><Field label={`Tối đa / 7 ngày · ${f.mealId}`} keyboardType="number-pad" value={String(f.max)} onChangeText={v => setPreference({ ...preferences, frequency: preferences.frequency.map(x => x.mealId === f.mealId ? { ...x, max: v === '' ? NaN : Number(v) } : x) })} /></View></View><Button title={`Bỏ tần suất ${f.mealId}`} secondary onPress={() => setPreference({ ...preferences, frequency: preferences.frequency.filter(x => x.mealId !== f.mealId) })} /></View>)}<Choice label="Thêm ràng buộc tần suất" dropdown items={store.ledger.spending.catalog.filter(m => !preferences.frequency.some(f => f.mealId === m.id))} selected={[]} onSelect={id => setPreference({ ...preferences, frequency: [...preferences.frequency, { mealId: id, min: 0, max: 21 }] })} /><Button title="Lưu làm sở thích mặc định" secondary disabled={busy} onPress={() => void action(async () => { validatePreferences(preferences, latest.current.ledger.spending.catalog); await write({ type: 'spending.preferences.set', mutationId: newId(), payload: { preferences } }); })} /><Field label="Mô tả sở thích cho AI local" multiline maxLength={1000} value={preferenceText} onChangeText={v => { invalidateAi(); latestText.current = v; setPreferenceText(v); setDirty(true); }} /><Button title={aiBusy ? 'AI đang xử lý…' : 'AI hiểu sở thích'} disabled={busy || aiBusy || !spendingAiAvailable} onPress={() => void action(async () => { const catalog = copy(latest.current.ledger.spending.catalog); const text = latestText.current; const requestRevision = draftRevision.current; const proposed = await spendingAi.infer(text, catalog); lock.assertUnlocked(); if (mounted.current && requestRevision === draftRevision.current && text === latestText.current && JSON.stringify(catalog) === JSON.stringify(latest.current.ledger.spending.catalog)) setAiPreview({ preferences: proposed, catalog: JSON.stringify(catalog), text, draftRevision: requestRevision }); })} />{aiBusy && <Button title="Hủy AI" secondary onPress={() => void spendingAi.cancel()} />}{!spendingAiAvailable && <Text style={styles.helper}>Expo Go không chạy AI native. Lựa chọn trực tiếp và lập kế hoạch vẫn dùng được.</Text>}{aiPreview && <><Text style={styles.text}>AI hiểu: thích {aiPreview.preferences.likedIds.map(id => store.ledger.spending.catalog.find(m => m.id === id)?.name ?? id).join(', ') || 'chưa chọn'}; không ăn {aiPreview.preferences.excludedIds.map(id => store.ledger.spending.catalog.find(m => m.id === id)?.name ?? id).join(', ') || 'chưa chọn'}; dị ứng {aiPreview.preferences.excludedAllergens.join(', ') || 'chưa chọn'}.</Text>{aiPreview.preferences.frequency.map(f => <Text key={f.mealId} style={styles.text}>{store.ledger.spending.catalog.find(m => m.id === f.mealId)?.name}: {f.min}–{f.max} lần / 7 ngày</Text>)}<Button title="Dùng và sửa điều kiện AI hiểu" secondary onPress={() => { try { lock.assertUnlocked(); if (!mounted.current || aiPreview.draftRevision !== draftRevision.current || aiPreview.text !== latestText.current) throw new Error('Bản nháp đã thay đổi. Yêu cầu AI hiểu lại trước khi áp dụng.'); if (aiPreview.catalog !== JSON.stringify(latest.current.ledger.spending.catalog)) throw new Error('Thực đơn đã thay đổi. Yêu cầu AI hiểu lại trước khi áp dụng.'); setPreference(copy(aiPreview.preferences)); } catch (e) { setError(errorMessage(e)); } }} /></>}</Card>
      <Button title={saved ? 'Xem phương án cân lại' : 'Tạo đề xuất kế hoạch'} disabled={busy || aiBusy} onPress={build} />
    </>}
    {panel === 'menu' && <>
      <Card><Text style={styles.heading}>Món và giá do bạn nhập</Text><Field label="Tên món" value={meal.name} maxLength={200} onChangeText={v => setMealField('name', v)} /><Field label="Giá một bữa VND" keyboardType="number-pad" value={meal.price} onChangeText={v => setMealField('price', v)} /><Field label="Khẩu phần" value={meal.portion} maxLength={200} onChangeText={v => setMealField('portion', v)} /><Choice label="Cách ăn" items={[{ id: 'cook', name: 'Tự nấu' }, { id: 'out', name: 'Ăn quán' }]} selected={[meal.mode]} onSelect={id => setMealField('mode', id as MealOption['mode'])} /><Field label="Địa chỉ quán (tùy chọn)" value={meal.address} maxLength={500} onChangeText={v => setMealField('address', v)} /><Field label="Nguồn giá" value={meal.priceSource} maxLength={500} onChangeText={v => setMealField('priceSource', v)} /><Field label="Ngày xác nhận giá YYYY-MM-DD" value={meal.pricedAt} onChangeText={v => setMealField('pricedAt', v)} /><Choice label="Trạng thái giá" items={[{ id: 'estimated', name: 'Ước tính' }, { id: 'confirmed', name: 'Đã xác nhận' }]} selected={[meal.estimated ? 'estimated' : 'confirmed']} onSelect={id => setMealField('estimated', id === 'estimated')} /><Field label="Nguyên liệu dị ứng, cách bằng dấu phẩy" value={meal.allergens.join(', ')} onChangeText={v => setMealField('allergens', v.split(',').map(x => x.trim()).filter(Boolean))} /><Text style={styles.helper}>Giá tự nhập, không phải giá thị trường tự cập nhật. Giá tự nấu phải bao gồm tiền mua thực trả cho bữa; chưa theo dõi tồn kho hay mua cả gói.</Text><Button title="Lưu món" disabled={busy} onPress={() => void action(async () => { const requestRevision = draftRevision.current; await write({ type: 'spending.meal.upsert', mutationId: newId(), payload: { meal: { ...meal, price: parseMoneyInput(meal.price) } } }); if (mounted.current && requestRevision === draftRevision.current) { setMeal(blankMeal(today)); setPreview(null); setAiPreview(null); } })} /><Button title="Món mới" secondary onPress={() => { invalidateAi(); setMeal(blankMeal(today)); setDirty(true); }} /></Card>
      {!store.ledger.spending.catalog.length && <Empty text="Chưa có món có giá. Thêm vài lựa chọn để tạo kế hoạch." />}{store.ledger.spending.catalog.map(m => <Card key={m.id}><Text style={styles.heading}>{m.name} · {formatMoney(m.price)}</Text><Text style={styles.secondary}>{m.portion} · {m.mode === 'cook' ? 'Tự nấu' : 'Ăn quán'} · {m.estimated ? 'Ước tính' : 'Đã xác nhận'} · {m.pricedAt}{m.address ? `\n${m.address}` : ''}</Text><Text style={styles.helper}>{m.priceSource}</Text><View style={styles.pair}><View style={styles.half}><Button title={`Sửa ${m.name}`} secondary onPress={() => { invalidateAi(); setMeal(copy(m)); setDirty(true); }} /></View><View style={styles.half}><Button title={`Xóa ${m.name}`} secondary disabled={busy} onPress={() => Alert.alert('Xóa món?', 'Ảnh chụp món trong kế hoạch được giữ. Gỡ món khỏi sở thích mặc định trước nếu đang dùng.', [{ text: 'Giữ', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void action(async () => { const requestRevision = draftRevision.current; await write({ type: 'spending.meal.delete', mutationId: newId(), payload: { id: m.id } }); if (mounted.current && requestRevision === draftRevision.current) { setPreview(null); setAiPreview(null); } }) }])} /></View></View></Card>)}
    </>}
    {panel === 'plan' && (() => {
      const daysMap = new Map<string, NonNullable<typeof shown>['meals']>();
      if (shown) {
        for (const m of shown.meals) {
          const list = daysMap.get(m.day) || [];
          list.push(m);
          daysMap.set(m.day, list);
        }
      }
      const days = Array.from(daysMap.entries());
      let spentPct = 0, plannedPct = 0, fixedPct = 0, reservePct = 0;
      if (shown && totals) {
        const totalBudget = BigInt(shown.config.budget || '0');
        if (totalBudget > 0n) {
          const s = BigInt(totals.spent || '0');
          const p = BigInt(totals.planned || '0');
          const f = BigInt(totals.fixedUnpaid || '0');
          const r = BigInt(shown.config.reserve || '0');
          spentPct = Math.min(100, Math.max(0, Number((s * 100n) / totalBudget)));
          plannedPct = Math.min(100 - spentPct, Math.max(0, Number((p * 100n) / totalBudget)));
          fixedPct = Math.min(100 - spentPct - plannedPct, Math.max(0, Number((f * 100n) / totalBudget)));
          reservePct = Math.min(100 - spentPct - plannedPct - fixedPct, Math.max(0, Number((r * 100n) / totalBudget)));
        }
      }
      return <>
        {store.ledger.spending.plans.length > 0 && <Choice label="Mở kế hoạch đã lưu" dropdown items={store.ledger.spending.plans.map(p => ({ id: p.config.id, name: `${p.config.name} · ${p.config.startDay}–${p.config.endDay}` }))} selected={saved ? [saved.config.id] : []} onSelect={id => openGuarded(store.ledger.spending.plans.find(p => p.config.id === id)!)} />}
        {!shown && <Empty text="Chưa có kế hoạch đang xem." action={<Button title="Nhập kỳ & tạo kế hoạch" secondary onPress={() => setPanel('config')} />} />}
        {shown && <>
          <Card>
            <View style={styles.spread}>
              <Text style={styles.heading}>{shown.config.name} · {shown.config.startDay}–{shown.config.endDay}</Text>
              <View style={[styles.badge, preview ? styles.badgeWarning : styles.badgeSuccess]}>
                <Text style={styles.badgeText}>{preview ? '⚡ Đề xuất mới' : `✓ Đã lưu · v${saved?.version}`}</Text>
              </View>
            </View>
            <Text style={styles.helper}>{preview ? 'Đề xuất chưa lưu' : `Đã lưu · phiên bản ${saved?.version}`} · Hoàn thành bữa không ghi sổ.</Text>
            {preview && <View style={[styles.card, { backgroundColor: '#202C32', borderColor: '#20D3A2' }]}><Text style={[styles.text, { color: '#20D3A2' }]}>💡 {preview.message}</Text></View>}
            {isStale && <Text accessibilityRole="alert" style={styles.error}>Dữ liệu đã thay đổi. Tạo lại đề xuất để kiểm tra chi thực tế.</Text>}
            {totalsError && <Text accessibilityRole="alert" style={styles.error}>{totalsError}</Text>}
            {totals && <>
              <View style={{ gap: 4, marginVertical: 6 }}>
                <Text style={styles.kpiLabel}>Ngân sách còn lại cuối kỳ</Text>
                <View style={styles.spread}>
                  <Text style={[styles.kpiHighlight, BigInt(totals.remaining) < 0n && { color: '#FF7484' }]}>{formatMoney(totals.remaining)}</Text>
                  <View style={[styles.badge, BigInt(totals.remaining) < 0n ? styles.badgeWarning : styles.badgeSuccess]}>
                    <Text style={styles.badgeText}>{BigInt(totals.remaining) < 0n ? '⚠ Vượt ngân sách' : '✓ Trong hạn mức'}</Text>
                  </View>
                </View>
                <Text style={[styles.amount, { display: 'none' }]}>Còn cuối kỳ {formatMoney(totals.remaining)}</Text>
                {BigInt(totals.remaining) < 0n && <Text style={styles.error}>Vượt ngân sách. Xem phương án cân lại; không dùng dự phòng hoặc giảm số bữa.</Text>}
              </View>

              <View style={styles.progressBar}>
                {spentPct > 0 && <View style={[styles.barSpent, { width: `${spentPct}%` }]} />}
                {plannedPct > 0 && <View style={[styles.barPlanned, { width: `${plannedPct}%` }]} />}
                {fixedPct > 0 && <View style={[styles.barFixed, { width: `${fixedPct}%` }]} />}
                {reservePct > 0 && <View style={[styles.barReserve, { width: `${reservePct}%` }]} />}
              </View>

              <View style={styles.metricGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricSub}>Đã chi</Text>
                  <Text style={styles.metricVal}>{formatMoney(totals.spent)}</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricSub}>Bữa còn dự trù</Text>
                  <Text style={[styles.metricVal, { color: '#86BFFF' }]}>{formatMoney(totals.planned)}</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricSub}>Cố định chưa chi</Text>
                  <Text style={[styles.metricVal, { color: '#F4C56A' }]}>{formatMoney(totals.fixedUnpaid)}</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricSub}>Dự phòng</Text>
                  <Text style={[styles.metricVal, { color: '#A78BFA' }]}>{formatMoney(shown.config.reserve)}</Text>
                </View>
              </View>
              <Text style={[styles.text, { display: 'none' }]}>Đã chi {formatMoney(totals.spent)} · cố định chưa chi {formatMoney(totals.fixedUnpaid)}</Text>
              <Text style={[styles.text, { display: 'none' }]}>Bữa còn dự trù {formatMoney(totals.planned)} · dự phòng {formatMoney(shown.config.reserve)}</Text>
            </>}
            <View style={{ gap: 8, marginTop: 8 }}>
              {preview && <Button title="Chấp nhận & lưu kế hoạch" disabled={busy || isStale || !totals || BigInt(totals.remaining) < 0n} onPress={() => void savePlan()} />}
              <View style={styles.pair}>
                <View style={styles.half}><Button title="Xem phương án cân lại" secondary disabled={busy || aiBusy} onPress={build} /></View>
                <View style={styles.half}><Button title="Sửa kỳ & điều kiện" secondary onPress={() => setPanel('config')} /></View>
              </View>
              <Button title="Kế hoạch mới" secondary disabled={busy} onPress={() => { invalidateAi(); const id = newId(); latestConfig.current = { ...latestConfig.current, id }; setConfig(c => ({ ...c, id })); setSaved(null); setPreview(null); setDirty(true); setPanel('config'); }} />
            </View>
          </Card>

          {days.map(([dayKey, dayMeals], dayIdx) => {
            const isToday = dayKey === today;
            const isPast = dayKey < today;
            const completedCount = dayMeals.filter(m => m.completed).length;
            const dayCost = dayMeals.reduce((sum, m) => sum + BigInt(m.meal.price), 0n);
            return <View key={dayKey} style={{ gap: 8, marginTop: dayIdx === 0 ? 4 : 12 }}>
              <View style={styles.dayMilestoneHeader}>
                <View style={styles.row}>
                  <Text style={[styles.heading, isToday && { color: '#20D3A2' }]}>{isToday ? `Hôm nay · ${dayKey}` : `Ngày ${dayIdx + 1} · ${dayKey}`}</Text>
                  {isToday && <View style={[styles.badge, styles.badgeInfo]}><Text style={[styles.badgeText, { color: '#20D3A2' }]}>Hiện tại</Text></View>}
                </View>
                <View style={styles.row}>
                  <View style={[styles.badge, styles.badgeMuted]}><Text style={styles.badgeText}>{completedCount}/{dayMeals.length} bữa</Text></View>
                  <Text style={[styles.secondary, { fontWeight: '600', fontVariant: ['tabular-nums'] }]}>{formatMoney(dayCost.toString())}</Text>
                </View>
              </View>
              <View style={styles.timeline}>
                <View style={styles.timelineTrack} />
                {dayMeals.map(slot => {
                  const protectedMeal = protectedSlot(slot, localDateKey(now, shown.config.timezone));
                  const mealType = shown.config.mealsPerDay === 3 ? (slot.index === 0 ? '🌅 Sáng' : slot.index === 1 ? '☀️ Trưa' : '🌙 Tối') : shown.config.mealsPerDay === 2 ? (slot.index === 0 ? '☀️ Trưa' : '🌙 Tối') : '🍽️ Bữa chính';
                  return <View key={`${slot.day}/${slot.index}`} style={{ position: 'relative' }}>
                    <View style={[styles.timelineNode, slot.completed ? styles.timelineNodeCompleted : slot.locked ? styles.timelineNodeLocked : isPast ? styles.timelineNodePast : null]}>
                      <Text style={{ fontSize: 9, color: slot.completed ? '#0B1012' : '#F2F6F5' }}>{slot.completed ? '✓' : slot.locked ? '🔒' : '●'}</Text>
                    </View>
                    <Card>
                      <View style={styles.spread}>
                        <View style={styles.row}>
                          <Text style={[styles.heading, { fontSize: 16 }]}>{mealType} · bữa {slot.index + 1}</Text>
                          <View style={[styles.badge, slot.meal.mode === 'cook' ? styles.badgeInfo : styles.badgeMuted]}>
                            <Text style={styles.badgeText}>{slot.meal.mode === 'cook' ? '🍳 Tự nấu' : '🏪 Ăn quán'}</Text>
                          </View>
                        </View>
                        {slot.completed ? <View style={[styles.badge, styles.badgeSuccess]}><Text style={[styles.badgeText, { color: '#57DFAC' }]}>✓ Đã xác nhận</Text></View> : slot.locked ? <View style={[styles.badge, styles.badgeWarning]}><Text style={[styles.badgeText, { color: '#F4C56A' }]}>🔒 Đã khóa</Text></View> : isPast ? <View style={[styles.badge, styles.badgeMuted]}><Text style={styles.badgeText}>Ngày đã qua</Text></View> : null}
                      </View>
                      <View style={styles.spread}>
                        <Text style={[styles.heading, { fontSize: 18 }]}>{slot.meal.name}</Text>
                        <Text style={[styles.amount, { color: '#20D3A2' }]}>{formatMoney(slot.meal.price)}</Text>
                      </View>
                      <Text style={styles.secondary}>{slot.meal.portion} · {slot.meal.estimated ? 'Ước tính' : 'Đã xác nhận'}{slot.meal.address ? `\n📍 ${slot.meal.address}` : ''}</Text>
                      <Text style={styles.helper}>{slot.meal.priceSource} · {slot.meal.pricedAt}{slot.completed ? ' · Bữa đã xác nhận' : ''}{slot.locked ? ' · Đã khóa' : ''}{slot.day < today ? ' · Ngày đã qua' : ''}</Text>
                      {protectedMeal ? <Text style={styles.helper}>Giữ nguyên khi cân lại.</Text> : <>
                        <Choice label={`Đổi món ${slot.day} bữa ${slot.index + 1}`} dropdown items={store.ledger.spending.catalog} selected={[slot.meal.id]} onSelect={id => swap(slot.day, slot.index, id)} />
                        <Choice label={`Liên kết chi ${slot.day} bữa ${slot.index + 1}`} dropdown items={expenseItems} selected={[slot.transactionId ?? '']} onSelect={id => changeSlot(slot.day, slot.index, { transactionId: id || null })} />
                        <View style={styles.pair}>
                          <View style={styles.half}><Button title={`Khóa bữa ${slot.index + 1} · ${slot.day}`} secondary disabled={busy || isStale} onPress={() => changeSlot(slot.day, slot.index, { locked: true })} /></View>
                          <View style={styles.half}><Button title={`Xác nhận bữa ${slot.index + 1} · ${slot.day}`} secondary disabled={busy || isStale} onPress={() => changeSlot(slot.day, slot.index, { completed: true })} /></View>
                        </View>
                      </>}
                      {slot.transactionId && <Text style={styles.helper}>Liên kết giao dịch {slot.transactionId}; chỉ trừ dự trù khi là chi thuộc kỳ/phạm vi.</Text>}
                    </Card>
                  </View>;
                })}
              </View>
            </View>;
          })}
        </>}
      </>;
    })()}
    {panel === 'model' && <Card><Text style={styles.heading}>{SPENDING_MODEL.name}</Text><Text style={styles.text}>Tải một lần khoảng 3,44 GB. Sau khi thiết lập, AI hiểu sở thích trên máy, không gửi sổ hoặc văn bản ra ngoài.</Text><Text style={styles.helper}>{SPENDING_MODEL.license} · {SPENDING_MODEL.runtime}. Khởi động và phản hồi trên iPhone 12 Pro Max cần đo thực tế; chưa cam kết tốc độ.</Text><Text style={styles.secondary}>Trạng thái: {({ missing: 'Chưa có mô hình', checking: 'Đang xác minh file', downloading: 'Đang tải', importing: 'Đang nhập', ready: 'File đã xác minh, sẵn sàng tải vào AI', loading: 'Đang nạp AI', inferring: 'Đang hiểu sở thích', thinking: 'Đang suy nghĩ', stopping: 'Đang hủy và giải phóng AI', error: 'Chưa sẵn sàng' })[ai.phase]}{ai.phase === 'downloading' ? ` · ${Math.round(ai.progress * 100)}%` : ''}</Text>{!!ai.error && <Text accessibilityRole="alert" style={styles.error}>{ai.error}</Text>}{!spendingAiAvailable && <Text style={styles.helper}>AI native cần bản Sổ Ví riêng; Expo Go dùng bộ lập kế hoạch và sở thích trực tiếp.</Text>}<Button title="Kiểm tra mô hình đã lưu" secondary disabled={busy || aiBusy || !spendingAiAvailable} onPress={() => void action(async () => { await spendingAi.checkModel(); })} /><Button title="Tải mô hình 3,44 GB" disabled={busy || aiBusy || !spendingAiAvailable} onPress={() => void action(async () => { await spendingAi.downloadModel(); })} /><Button title="Nhập file mô hình" secondary disabled={busy || aiBusy || !spendingAiAvailable} onPress={() => void action(async () => { await spendingAi.importModel(); })} />{aiBusy && <Button title="Hủy AI / tải mô hình" secondary onPress={() => void spendingAi.cancel()} />}<Button title="Xóa mô hình khỏi máy" secondary disabled={busy || aiBusy || !spendingAiAvailable} onPress={() => Alert.alert('Xóa mô hình?', 'Kế hoạch, sở thích và giao dịch được giữ nguyên.', [{ text: 'Giữ', style: 'cancel' }, { text: 'Xóa', style: 'destructive', onPress: () => void action(async () => { await spendingAi.deleteModel(); }) }])} /><Text style={styles.helper}>Chỉ AI hiểu sở thích; giá, số dư và điều kiện do bộ lập kế hoạch kiểm tra. Chưa có file hoặc AI lỗi, chọn trực tiếp vẫn dùng được.</Text></Card>}
  </Page>;
}
