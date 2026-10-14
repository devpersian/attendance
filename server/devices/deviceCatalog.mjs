/**
 * Device catalog — known attendance / access-control devices and how to talk to them.
 *
 * Each entry describes:
 *   id            stable key stored in Devices.ModelId
 *   brand, model  display names
 *   category      fingerprint | face | card | mixed | gateway | software
 *   protocols     ordered list of supported comm protocols (first = default)
 *   biometrics    what the device records: fingerprint, face, card, password...
 *   defaults      suggested port / polling interval
 *   fields        extra connection settings the UI must show (key,label,type,default?,required?,options?)
 *   fetchApi      optional API-based pull integration (instead of raw socket protocol)
 *   notes         integration hints
 */

const catalog = [
  // ─────────────── ZKTeco (ZK Pull Protocol / SDK) ───────────────
  {
    id: 'zk-uface-202', brand: 'ZKTeco', model: 'uFace 202', category: 'face',
    protocols: ['zk', 'http-push'], biometrics: ['face', 'card', 'password'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [
      { key: 'deviceId', label: 'شناسه دستگاه روی دستگاه (Device ID)', type: 'number', default: 1 },
      { key: 'password', label: 'رمز ورود پروتکل ZK', type: 'string', default: '0' },
    ],
    notes: 'پروتکل ZK Pull روی پورت 4370. الگوریتم چهره FacePro V10.',
  },
  {
    id: 'zk-scan-m100', brand: 'ZKTeco', model: 'Scan-M100 Plus', category: 'mixed',
    protocols: ['zk', 'http-push'], biometrics: ['fingerprint', 'face', 'card', 'password'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [
      { key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 },
      { key: 'password', label: 'رمز ورود پروتکل ZK', type: 'string', default: '0' },
    ],
    notes: 'چند بیومتریک؛ پشتیبانی از ADMS push در تنظیمات وب.',
  },
  {
    id: 'zk-x9', brand: 'ZKTeco', model: 'X9', category: 'mixed',
    protocols: ['zk', 'http-push'], biometrics: ['fingerprint', 'face', 'card', 'password'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: 'ترمینال دسترسی و تردد؛ پروتکل استاندارد ZK.',
  },
  {
    id: 'zk-inference', brand: 'ZKTeco', model: 'Inference (SpeedFace-V5L)', category: 'face',
    protocols: ['zk', 'http-push'], biometrics: ['face'],
    defaults: { port: 4370, pollingInterval: 30 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: 'تشخیص چهره سریع؛ ماسک‌محور.',
  },
  {
    id: 'zk-proxxxx', brand: 'ZKTeco', model: 'ProXXXX Series', category: 'mixed',
    protocols: ['zk', 'http-push'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: 'سری حرفه‌ای چندبیومتریک.',
  },
  {
    id: 'zk-fr3000', brand: 'ZKTeco', model: 'FR3000/FR4000', category: 'fingerprint',
    protocols: ['zk', 'tcp'], biometrics: ['fingerprint', 'card', 'password'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: 'کنترل دسترسی رله‌ای با اثر انگشت.',
  },
  {
    id: 'zk-kte-connect', brand: 'ZKTeco', model: 'KTE Connect Cloud Gateway', category: 'gateway',
    protocols: ['http-push'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 80, pollingInterval: 0 },
    fields: [
      { key: 'serverUrl', label: 'آدرس سرور KTE Connect', type: 'string' },
      { key: 'apiToken', label: 'توکن API', type: 'string', required: true },
    ],
    fetchApi: 'kte-connect',
    notes: 'دستگاه‌های پشت گیت‌وی ابری KTE Connect از طریق REST API کشیده می‌شوند.',
  },

  // ─────────────── Digital Finger (FPVtech / Dahua) ───────────────
  {
    id: 'df-fp300', brand: 'DigitalFinger', model: 'FP300', category: 'fingerprint',
    protocols: ['fpvtech', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 6535, pollingInterval: 60 },
    fields: [{ key: 'comKey', label: 'COM Key', type: 'string', default: '00000000' }],
    notes: 'پروتکل FPVtech روی TCP.',
  },
  {
    id: 'df-r5h', brand: 'DigitalFinger', model: 'R5H', category: 'mixed',
    protocols: ['fpvtech', 'http-push'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 6535, pollingInterval: 60 },
    fields: [{ key: 'comKey', label: 'COM Key', type: 'string', default: '00000000' }],
    notes: 'ترمینال چندبیومتریک.',
  },
  {
    id: 'df-scan500', brand: 'DigitalFinger', model: 'SCAN-RFID560 / 570', category: 'card',
    protocols: ['fpvtech', 'tcp'], biometrics: ['card'],
    defaults: { port: 6535, pollingInterval: 60 },
    fields: [{ key: 'comKey', label: 'COM Key', type: 'string', default: '00000000' }],
    notes: 'کارت RFID/MIFARE.',
  },

  // ─────────────── Hikvision ───────────────
  {
    id: 'hk-ds-k1t321', brand: 'Hikvision', model: 'DS-K1T321AMiX (Face+Card)', category: 'face',
    protocols: ['isapi', 'websockets'], biometrics: ['face', 'card', 'password'],
    defaults: { port: 80, pollingInterval: 120 },
    fields: [
      { key: 'username', label: 'نام کاربری دستگاه', type: 'string', required: true },
      { key: 'password', label: 'رمز دستگاه', type: 'password', required: true },
      { key: 'eventFilter', label: 'فیلتر رویداد', type: 'select', options: ['AccessControl', 'Attendance', 'all'], default: 'Attendance' },
    ],
    fetchApi: 'isapi',
    notes: 'ISAPI (HTTP Digest): /ISAPI/AccessControl/AcsEvent; همچنین Event Push به URL سرور قابل تنظیم است.',
  },
  {
    id: 'hk-ds-k1e06f', brand: 'Hikvision', model: 'DS-K1E06F (Face)', category: 'face',
    protocols: ['isapi'], biometrics: ['face'],
    defaults: { port: 80, pollingInterval: 120 },
    fields: [
      { key: 'username', label: 'نام کاربری دستگاه', type: 'string', required: true },
      { key: 'password', label: 'رمز دستگاه', type: 'password', required: true },
    ],
    fetchApi: 'isapi',
    notes: 'پایانه چهره اقتصادی.',
  },
  {
    id: 'hk-dsk2l102', brand: 'Hikvision', model: 'DS-K2L102-C (Card)', category: 'card',
    protocols: ['isapi'], biometrics: ['card'],
    defaults: { port: 80, pollingInterval: 120 },
    fields: [
      { key: 'username', label: 'نام کاربری دستگاه', type: 'string', required: true },
      { key: 'password', label: 'رمز دستگاه', type: 'password', required: true },
    ],
    fetchApi: 'isapi',
    notes: 'کنترل دسترسی کارت.',
  },

  // ─────────────── Dahua ───────────────
  {
    id: 'dh-asr1032e', brand: 'Dahua', model: 'ASI7216X / ASR1032E (Face)', category: 'face',
    protocols: ['dws', 'http-push'], biometrics: ['face', 'fingerprint', 'card'],
    defaults: { port: 80, pollingInterval: 120 },
    fields: [
      { key: 'username', label: 'نام کاربری دستگاه', type: 'string', required: true },
      { key: 'password', label: 'رمز دستگاه', type: 'password', required: true },
    ],
    fetchApi: 'dws',
    notes: 'Dahua Web Service (HTTP JSON): جستجوی رویداد با /cgi-bin/manager/accountManager.isapi یا EventUpload push.',
  },
  {
    id: 'dh-asi8214e', brand: 'Dahua', model: 'ASI8214E (Face+Finger)', category: 'mixed',
    protocols: ['dws'], biometrics: ['face', 'fingerprint'],
    defaults: { port: 80, pollingInterval: 120 },
    fields: [
      { key: 'username', label: 'نام کاربری دستگاه', type: 'string', required: true },
      { key: 'password', label: 'رمز دستگاه', type: 'password', required: true },
    ],
    fetchApi: 'dws',
    notes: '',
  },

  // ─────────────── Suprema ───────────────
  {
    id: 'sp-facestation-f2', brand: 'Suprema', model: 'FaceStation F2 (Face+Card, mask-proof)', category: 'face',
    protocols: ['suprema', 'biostar2'], biometrics: ['face', 'card', 'password'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: 'تشخیص چهره با ماسک، الگوریتم یادگیری عمیق؛ از طریق BioStar 2 REST.',
  },
  {
    id: 'sp-facestation-2', brand: 'Suprema', model: 'FaceStation 2 / FaceStation', category: 'face',
    protocols: ['suprema', 'biostar2'], biometrics: ['face', 'card'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: 'ظرفیت ۳۰٬۰۰۰ کاربر؛ شناسایی ۴۰۰۰ چهره در ثانیه.',
  },
  {
    id: 'sp-biostation-a2', brand: 'Suprema', model: 'BioStation A2', category: 'fingerprint',
    protocols: ['suprema', 'biostar2'], biometrics: ['fingerprint', 'card', 'password'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: '',
  },
  {
    id: 'sp-biostation-t2', brand: 'Suprema', model: 'BioStation T2', category: 'mixed',
    protocols: ['suprema', 'biostar2'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: '',
  },
  {
    id: 'sp-xstation', brand: 'Suprema', model: 'XStation (Multi-Bio)', category: 'mixed',
    protocols: ['suprema', 'biostar2'], biometrics: ['face', 'fingerprint', 'card'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: 'چندبیومتریک هم‌زمان (چهره + اثر انگشت).',
  },
  {
    id: 'sp-dstation', brand: 'Suprema', model: 'DStation', category: 'mixed',
    protocols: ['suprema', 'biostar2'], biometrics: ['face', 'fingerprint', 'card'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: '',
  },
  {
    id: 'sp-biolite-net', brand: 'Suprema', model: 'BioLite Net', category: 'fingerprint',
    protocols: ['suprema', 'biostar2'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: '',
  },
  {
    id: 'sp-biomini', brand: 'Suprema', model: 'BioMini / Plus2 / Slim / Combo (Scanner)', category: 'fingerprint',
    protocols: ['fpvtech', 'tcp'], biometrics: ['fingerprint'],
    defaults: { port: 0, pollingInterval: 0 },
    fields: [
      { key: 'connection', label: 'نوع اتصال', type: 'select', options: ['usb', 'lan'], default: 'usb' },
    ],
    notes: 'اسکنر ثبت اثر انگشت (انگشت‌نگاری) — معمولاً USB و تحت SDK؛ برای enrollment استفاده می‌شود نه کشیدن تردد.',
  },

  // ─────────────── Virdi (Korea) ───────────────
  {
    id: 'vd-ac7000', brand: 'Virdi', model: 'AC-7000 Series', category: 'mixed',
    protocols: ['virdi', 'http-push'], biometrics: ['fingerprint', 'card', 'password'],
    defaults: { port: 7777, pollingInterval: 60 },
    fields: [
      { key: 'username', label: 'شناسه ترمینال', type: 'number', default: 1 },
      { key: 'password', label: 'رمز دسترسی', type: 'password', default: '0' },
    ],
    notes: 'پروتکل VirdiCore روی TCP پورت 7777 یا push از طریق وب‌سرویس.',
  },
  {
    id: 'vd-unx200', brand: 'Virdi', model: 'UNX-200/300 Series', category: 'mixed',
    protocols: ['virdi', 'http-push'], biometrics: ['fingerprint', 'face', 'card', 'password'],
    defaults: { port: 7777, pollingInterval: 60 },
    fields: [
      { key: 'username', label: 'شناسه ترمینال', type: 'number', default: 1 },
      { key: 'password', label: 'رمز دسترسی', type: 'password', default: '0' },
    ],
    notes: 'ترمینال‌های چندبیومتریک UNX؛ فرمان GETLOG.',
  },

  // ─────────────── TrustOne (تراست وان) ───────────────
  {
    id: 'to-tsg250', brand: 'TrustOne', model: 'TSG-250', category: 'fingerprint',
    protocols: ['trustone', 'tcp', 'http-push'], biometrics: ['fingerprint', 'card', 'password'],
    defaults: { port: 8601, pollingInterval: 60 },
    fields: [
      { key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 },
      { key: 'password', label: 'رمز دسترسی', type: 'password', default: '0' },
    ],
    notes: 'سنسور اثر انگشت؛ پروتکل متنی TCP اختصاصی تراست‌وان.',
  },
  {
    id: 'to-tsg550', brand: 'TrustOne', model: 'TSG-550', category: 'fingerprint',
    protocols: ['trustone', 'tcp', 'http-push'], biometrics: ['fingerprint', 'card', 'password'],
    defaults: { port: 8601, pollingInterval: 60 },
    fields: [
      { key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 },
      { key: 'password', label: 'رمز دسترسی', type: 'password', default: '0' },
    ],
    notes: '',
  },
  {
    id: 'to-tsg750', brand: 'TrustOne', model: 'TSG-750', category: 'fingerprint',
    protocols: ['trustone', 'tcp', 'http-push'], biometrics: ['fingerprint', 'card', 'password'],
    defaults: { port: 8601, pollingInterval: 60 },
    fields: [
      { key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 },
      { key: 'password', label: 'رمز دسترسی', type: 'password', default: '0' },
    ],
    notes: 'سنسور پلیمری با سرعت شناسایی بالا برای ساعات اوج تردد.',
  },
  {
    id: 'to-fe500', brand: 'TrustOne', model: 'FE-500 / FE-500Lite / FE-500S', category: 'face',
    protocols: ['trustone', 'tcp', 'http-push'], biometrics: ['face', 'card', 'password'],
    defaults: { port: 8601, pollingInterval: 60 },
    fields: [
      { key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 },
      { key: 'password', label: 'رمز دسترسی', type: 'password', default: '0' },
    ],
    notes: 'دستگاه کارت‌ساعت تشخیص چهره تراست‌وان.',
  },

  // ─────────────── Tosan (ایرانی) ───────────────
  {
    id: 'ts-tsp450', brand: 'Tosan', model: 'TSP-450', category: 'mixed',
    protocols: ['tosan', 'tcp', 'http-push'], biometrics: ['fingerprint', 'face', 'card', 'password'],
    defaults: { port: 8590, pollingInterval: 60 },
    fields: [
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string', default: 'ef010000' },
    ],
    notes: 'دستگاه حضور و غیاب ایرانی توسان؛ پروتکل LAN روی پورت 8590.',
  },

  // ─────────────── CMITech (کره — cmi-tech.com، ترمینال‌های عنبیه/چهره) ───────────────
  {
    id: 'cm-ef45', brand: 'CMITech', model: 'EF-45NC (Dual-Iris Terminal)', category: 'mixed',
    protocols: ['cmitech', 'tcp', 'http-push'], biometrics: ['iris', 'face', 'card'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [
      { key: 'loginCommand', label: 'فرمان ورود (hex)', type: 'string' },
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string', default: 'ef010000' },
    ],
    notes: 'سیستم دوچشمی تشخیص عنبیه با راهنمایی موقعیت‌یابی روی نمایشگر چهره؛ سنسور TOF تا ۱.۲ متر. پروتکل LAN اختصاصی یا HTTP Push.',
  },
  {
    id: 'cm-ef70', brand: 'CMITech', model: 'EF-70 (Iris + Face، برد ۷۰ سانتی‌متر)', category: 'mixed',
    protocols: ['cmitech', 'tcp', 'http-push'], biometrics: ['iris', 'face', 'card'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [
      { key: 'loginCommand', label: 'فرمان ورود (hex)', type: 'string' },
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string', default: 'ef010000' },
    ],
    notes: 'ترکیب عنبیه + چهره با فاصله_capture تا ۷۰ سانتی‌متر؛ مناسب احراز هویت دولتی و کنترل دسترسی.; حالت هم‌زمان عنبیه و چهره.',
  },
  {
    id: 'cm-efm70', brand: 'CMITech', model: 'EFM-70 (Iris Module، برد ۷۰ سانتی‌متر)', category: 'mixed',
    protocols: ['cmitech', 'tcp'], biometrics: ['iris'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [
      { key: 'loginCommand', label: 'فرمان ورود (hex)', type: 'string' },
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string', default: 'ef010000' },
    ],
    notes: 'ماژول شناسایی عنبیه بلندبرد برای یکپارچه‌سازی در کیوسک، خودپرداز و سامانه‌های خودخدمت.',
  },
  {
    id: 'cm-efm45', brand: 'CMITech', model: 'EFM-45 (Iris Module)', category: 'mixed',
    protocols: ['cmitech', 'tcp'], biometrics: ['iris'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [
      { key: 'loginCommand', label: 'فرمان ورود (hex)', type: 'string' },
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string', default: 'ef010000' },
    ],
    notes: 'ماژول شناسایی عنبیه برای کیوسک و ATM.',
  },
  {
    id: 'cm-novaface3', brand: 'CMITech', model: 'NovaFace-3 (Face Terminal)', category: 'face',
    protocols: ['cmitech', 'tcp', 'http-push'], biometrics: ['face', 'card'],
    defaults: { port: 8600, pollingInterval: 30 },
    fields: [
      { key: 'loginCommand', label: 'فرمان ورود (hex)', type: 'string' },
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string', default: 'ef010000' },
    ],
    notes: 'شناسایی چهره نسل جدید با سرعت بسیار بالا، ردیابی سوژه و از‌کار‌افتادگی کم؛ مناسب تردد پرتردد.',
  },
  {
    id: 'cm-novaface2n', brand: 'CMITech', model: 'NovaFace-2N (Face Terminal)', category: 'face',
    protocols: ['cmitech', 'tcp', 'http-push'], biometrics: ['face', 'card'],
    defaults: { port: 8600, pollingInterval: 30 },
    fields: [
      { key: 'loginCommand', label: 'فرمان ورود (hex)', type: 'string' },
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string', default: 'ef010000' },
    ],
    notes: 'پایانه تشخیص چهره دقیق و مقرون‌به‌صرفه؛ احراز هویت معمولاً زیر ۱ ثانیه؛ حالت عنبیه/چهره/ترکیبی.',
  },
  {
    id: 'cm-bmt20', brand: 'CMITech', model: 'BMT-20 (Binocular Dual-Iris Enrollment)', category: 'mixed',
    protocols: ['cmitech', 'tcp'], biometrics: ['iris'],
    defaults: { port: 8600, pollingInterval: 0 },
    fields: [],
    notes: 'دستگاه ثبت‌نام عنبیه دوچشمی (نوع دوربینی) برای طرح‌های ID شهروندی بزرگ‌مقیاس — عمدتاً تحت SDK؛ برای enrollment از Enrollment Bridge استفاده کنید.',
    sdkOnly: true,
  },
  {
    id: 'cm-emx30', brand: 'CMITech', model: 'EMX-30 (Desktop Dual-Iris، برد ۳۳ سانتی‌متر)', category: 'mixed',
    protocols: ['cmitech', 'tcp'], biometrics: ['iris'],
    defaults: { port: 8600, pollingInterval: 0 },
    fields: [],
    notes: 'سیستم دوچشمی عنبیه رومیزی با اتوتیلط و اتصال USB برای احراز هویت دسکتاپ — تحت SDK؛ enrollment از طریق Enrollment Bridge.',
    sdkOnly: true,
  },
  {
    id: 'mk-t250', brand: 'Makim', model: 'T-250 Access Gate', category: 'gateway',
    protocols: ['wiegand-gateway', 'tcp'], biometrics: ['card'],
    defaults: { port: 4357, pollingInterval: 30 },
    fields: [{ key: 'format', label: 'فرمت کارت', type: 'select', options: ['Wiegand-26', 'Wiegand-34', 'OSDP'], default: 'Wiegand-26' }],
    notes: 'گیت کنترل تردد؛ رویدادهای تردد از طریق درگاه Wiegand→TCP یا تریگر دستگاه مجاور.',
  },

  {
    id: 'sp-biopro', brand: 'Suprema', model: 'BioPro / BioStation 2', category: 'fingerprint',
    protocols: ['suprema', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: 'بهترین حالت از طریق BioStar 2 REST API؛ پروتکل خام نیازمند SDK.',
  },
  {
    id: 'sp-xpass', brand: 'Suprema', model: 'XPass-S200/S400', category: 'mixed',
    protocols: ['suprema'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 9090, pollingInterval: 60 },
    fields: [
      { key: 'serverUrl', label: 'آدرس BioStar 2', type: 'string' },
      { key: 'apiToken', label: 'API Token (BioStar 2)', type: 'string' },
    ],
    fetchApi: 'biostar2',
    notes: '',
  },

  // ─────────────── eSSL ───────────────
  {
    id: 'es-midas-i3', brand: 'eSSL', model: 'MIDAS-iFace300 / i3', category: 'face',
    protocols: ['zk', 'essl-pull'], biometrics: ['face', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: 'سازگار با پروتکل ZK.',
  },
  {
    id: 'es-biocatch', brand: 'eSSL', model: 'BioCatch 700', category: 'fingerprint',
    protocols: ['zk', 'essl-pull'], biometrics: ['fingerprint'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: '',
  },

  // ─────────────── Controlianz ───────────────
  {
    id: 'co-x9-mini', brand: 'Controlianz', model: 'X9 Mini', category: 'mixed',
    protocols: ['controlianz', 'tcp'], biometrics: ['fingerprint', 'face', 'card', 'password'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [
      { key: 'username', label: 'کاربر Telnet', type: 'string', default: 'admin' },
      { key: 'password', label: 'رمز Telnet', type: 'password', default: 'admin' },
    ],
    fetchApi: 'telnet',
    notes: 'پروتکل telnet اختصاصی؛ فرمان GETATTENDANCE.',
  },
  {
    id: 'co-tc2000', brand: 'Controlianz', model: 'TC-2000', category: 'mixed',
    protocols: ['controlianz', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [
      { key: 'username', label: 'کاربر Telnet', type: 'string', default: 'admin' },
      { key: 'password', label: 'رمز Telnet', type: 'password', default: 'admin' },
    ],
    fetchApi: 'telnet',
    notes: '',
  },

  // ─────────────── Realtime / SmartPlus / Apex / CrossChex ───────────────
  {
    id: 'rt-rk300', brand: 'Realtime', model: 'RK-300 / RD-100C', category: 'fingerprint',
    protocols: ['realtime', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [{ key: 'pin', label: 'PIN اپراتور', type: 'string', default: '0' }],
    notes: 'پروتکل متنی Realtime روی TCP.',
  },
  {
    id: 'sm-sc202', brand: 'SmartPlus', model: 'SP-DJ100 / SC-202', category: 'mixed',
    protocols: ['smartplus', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [],
    notes: '',
  },
  {
    id: 'ax-apex-z500', brand: 'Apex', model: 'APEX-Z500', category: 'fingerprint',
    protocols: ['apex', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 8600, pollingInterval: 60 },
    fields: [],
    notes: '',
  },
  {
    id: 'cc-stellar-v', brand: 'CrossChex', model: 'Stellar-V', category: 'mixed',
    protocols: ['zk', 'crosschex'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: 'CrossChex Cloud دارای Webhook/REST است.',
  },

  // ─────────────── Other common terminals ───────────────
  {
    id: 'id-teco-ta300', brand: 'IDTECO', model: 'TA-300', category: 'mixed',
    protocols: ['zk', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: '',
  },
  {
    id: 'mythlink-8600', brand: 'Mythlink', model: 'MY-8600', category: 'mixed',
    protocols: ['zk', 'tcp'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: '',
  },
  {
    id: 'fingertec-face', brand: 'FingerTec', model: 'Face Pro / F10', category: 'mixed',
    protocols: ['tcp', 'pullsdk'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: 'FingerTec PullSDK.',
  },
  {
    id: 'timerime-t100', brand: 'Timerime', model: 'T100 / T200', category: 'mixed',
    protocols: ['zk', 'tcp'], biometrics: ['fingerprint', 'face', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: '',
  },
  {
    id: 'rcp-ts200', brand: 'RCP', model: 'TS200', category: 'fingerprint',
    protocols: ['zk', 'tcp'], biometrics: ['fingerprint', 'card'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [{ key: 'deviceId', label: 'شناسه دستگاه روی دستگاه', type: 'number', default: 1 }],
    notes: '',
  },

  // ─────────────── Card-only readers / gateways ───────────────
  {
    id: 'hid-signo', brand: 'HID', model: 'Signo / Edge ESE', category: 'card',
    protocols: ['wiegand-gateway', 'tcp'], biometrics: ['card'],
    defaults: { port: 4357, pollingInterval: 60 },
    fields: [{ key: 'format', label: 'فرمت کارت', type: 'select', options: ['Wiegand-26', 'Wiegand-34', 'OSDP'], default: 'Wiegand-26' }],
    notes: 'معمولاً از طریق درگاه Wiegand→TCP یا کنترلر مرکزی.',
  },
  {
    id: 'sdk600', brand: 'Generic', model: 'SDK600 / S501 (Wiegand Gateway)', category: 'gateway',
    protocols: ['sdk600', 'tcp'], biometrics: ['card'],
    defaults: { port: 8899, pollingInterval: 30 },
    fields: [{ key: 'password', label: 'رمز درگاه', type: 'password', default: '' }],
    notes: 'درگاه کارت رایج SDK600.',
  },

  // ─────────────── Software / generic ───────────────
  {
    id: 'generic-http', brand: 'Generic', model: 'HTTP Push (وب‌سرویس دلخواه)', category: 'software',
    protocols: ['http-push'], biometrics: ['any'],
    defaults: { port: 80, pollingInterval: 0 },
    fields: [
      { key: 'endpoint', label: 'مسیر webhook (نسبی)', type: 'string', default: '/api/devices/webhook' },
      { key: 'sharedSecret', label: 'رمز مشترک (هدر X-Device-Token)', type: 'string' },
    ],
    notes: 'هر نرم‌افزار یا درگاهی که رویداد را JSON POST می‌کند.',
  },
  {
    id: 'generic-tcp', brand: 'Generic', model: 'TCP Raw (پروتکل سفارشی)', category: 'software',
    protocols: ['tcp'], biometrics: ['any'],
    defaults: { port: 4370, pollingInterval: 60 },
    fields: [
      { key: 'loginCommand', label: 'فرمان ورود (hex)', type: 'string' },
      { key: 'dataCommand', label: 'فرمان دریافت داده (hex)', type: 'string' },
    ],
    notes: 'برای دستگاه‌های کم‌شناخته با فرمت مستند.',
  },
];

export const DEVICE_CATALOG = catalog;

export function findDeviceModel(modelId) {
  return catalog.find((d) => d.id === modelId) || null;
}

export default catalog;
