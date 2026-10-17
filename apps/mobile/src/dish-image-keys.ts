/** Estimate meals use their own picture; other meals fall back by name to a noodle bowl, rice plate, bánh mì or a set meal. */
export function dishImageKey(meal: { id: string; name: string }, hasImage: (key: string) => boolean): string {
  const own = meal.id.replace(/^roadmap-estimate-/, '');
  if (meal.id.startsWith('roadmap-estimate-') && hasImage(own)) return own;
  const name = meal.name.toLowerCase().normalize('NFC');
  if (/bánh mì|bánh mỳ/.test(name)) return 'banh-mi';
  if (/^(?:bún|phở|hủ ti|mì|mỳ|miến|bánh canh|cháo|lẩu)/.test(name)) return name.startsWith('cháo') ? 'chao' : 'generic-noodle';
  if (/cơm/.test(name)) return 'generic-rice';
  return 'generic-meal';
}
