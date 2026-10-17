import type { ImageSourcePropType } from 'react-native';
import { dishImageKey } from './dish-image-keys';

// Original flat illustrations drawn for Sổ Ví (assets/dishes, 192 px, transparent). Metro needs static requires.
const images: Record<string, ImageSourcePropType> = {
  'banh-canh': require('../assets/dishes/banh-canh.png'),
  'banh-cuon': require('../assets/dishes/banh-cuon.png'),
  'banh-mi': require('../assets/dishes/banh-mi.png'),
  'banh-uot': require('../assets/dishes/banh-uot.png'),
  'banh-xeo': require('../assets/dishes/banh-xeo.png'),
  'bo-ne': require('../assets/dishes/bo-ne.png'),
  'bun-bo': require('../assets/dishes/bun-bo.png'),
  'bun-ca': require('../assets/dishes/bun-ca.png'),
  'bun-cha': require('../assets/dishes/bun-cha.png'),
  'bun-dau': require('../assets/dishes/bun-dau.png'),
  'bun-mam': require('../assets/dishes/bun-mam.png'),
  'bun-rieu': require('../assets/dishes/bun-rieu.png'),
  'bun-thit-nuong': require('../assets/dishes/bun-thit-nuong.png'),
  'chao': require('../assets/dishes/chao.png'),
  'com-ca': require('../assets/dishes/com-ca.png'),
  'com-ga': require('../assets/dishes/com-ga.png'),
  'com-tam': require('../assets/dishes/com-tam.png'),
  'cook-banh-mi-op-la': require('../assets/dishes/cook-banh-mi-op-la.png'),
  'cook-chao-trung': require('../assets/dishes/cook-chao-trung.png'),
  'cook-com-ca-kho': require('../assets/dishes/cook-com-ca-kho.png'),
  'cook-com-canh-dau': require('../assets/dishes/cook-com-canh-dau.png'),
  'cook-com-rau-xao': require('../assets/dishes/cook-com-rau-xao.png'),
  'cook-com-thit-kho': require('../assets/dishes/cook-com-thit-kho.png'),
  'cook-com-trung': require('../assets/dishes/cook-com-trung.png'),
  'cook-mi-trung': require('../assets/dishes/cook-mi-trung.png'),
  'generic-meal': require('../assets/dishes/generic-meal.png'),
  'generic-noodle': require('../assets/dishes/generic-noodle.png'),
  'generic-rice': require('../assets/dishes/generic-rice.png'),
  'hu-tieu': require('../assets/dishes/hu-tieu.png'),
  'mi-quang': require('../assets/dishes/mi-quang.png'),
  'mi-xao': require('../assets/dishes/mi-xao.png'),
  'pho': require('../assets/dishes/pho.png'),
  'xoi': require('../assets/dishes/xoi.png'),
};
export const DISH_IMAGE_KEYS = Object.keys(images);
export const dishImage = (meal: { id: string; name: string }) => images[dishImageKey(meal, key => Object.hasOwn(images, key))] ?? images['generic-meal'];
