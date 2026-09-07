# گزارش ممیزی کامل‌بودن پایگاه دانش «امدادگر» در برابر استانداردهای استفاده‌شده

- **تاریخ بررسی:** ۲۰۲۶-۰۹-۰۷
- **شاخه:** `arena/01a07dca-aid`
- **نسخهٔ پایگاه:** `kbVersion 19` (فارسی) — انگلیسی هم پاریتی کامل دارد
- **نتیجهٔ ابزارها:** `kb` و `kb-en` هر دو «KB validation OK (35 cases)» — `227/227` تست موفق
- **محدودهٔ بررسی:** بیماری‌ها و آسیب‌هایی که در استانداردهای **مستقیماً در `sources` پروژه ذکر شده‌اند** اما در پایگاه دانش (`kb/` و `kb-en/`) نیستند.

---

## ۱) خلاصهٔ وضعیت

| معیار | مقدار | وضعیت |
|---|---|---|
| کیس/راهنمای پزشکی (فارسی) | ۳۵ | ✅ |
| کیس/راهنمای پزشکی (انگلیسی) | ۳۵ | ✅ پاریتی کامل |
| نشانه/مشاهده (فارسی) | ۹۰ | ✅ |
| دسته‌های کتابخانه | ۸ | ✅ |
| اعتبارسنجی schema | OK | ✅ |
| تست‌های خودکار | ۲۲۷/۲۲۷ | ✅ |
| کشورها در انتخابگر | ۲۴۹ | ✅ |
| پروفایل تماس تأییدشده | ۵۶ | 🟡 (کامل نیست، اما طبق طراحی فقط پروفایل مستند ثبت می‌شود) |

**خواندن کوتاه:** زیرساخت و داده‌های ساختاری کاملاً سالم و دوازبانگی دقیق است. اما **پوشش این استانداردها کامل نیست**؛ چند بیماری/آسیب مهم که در منابعی که خود پروژه ذکر می‌کند آمده و در پایگاه نیست.

---

## ۲) استانداردهای استفاده‌شده در `sources`

پروژه به این منابع اصلی استناد می‌کند:

1. **2024 AHA & American Red Cross Guidelines for First Aid** — ۳۸ مبحث
2. **AHA 2025 Guidelines for CPR and ECC** (Adult BLS، Pediatric BLS، FBAO، Drowning، Hypothermia، Opioid، Recovery Position)
3. **ILCOR 2025 First Aid CoSTR** — ۳۲ مبحث
4. **ERC 2025 Guidelines — First Aid**
5. **WHO Basic Emergency Care**
6. **WHO Snakebite / WHO Animal bites / WHO Rabies**
7. CDC، IFRC 2020، ADA 2026 و منابع گونه‌ای ایران

---

## ۳) پوشش مبحث‌به‌مبحث — 2024 AHA / Red Cross First Aid

| مبحث در گایدلاین | کیس/پشتیبانی در برنامه | وضعیت |
|---|---|---|
| Anaphylaxis | `anaphylaxis` | ✅ |
| Asthma | `breathing-difficulty` | ✅ |
| Bee & wasp stings | `bee-wasp-sting` | ✅ |
| Care/cooling of thermal burns | `thermal-burn` | ✅ |
| Chemical exposure to the eye | `eye-foreign` | ✅ |
| Chemical exposure to the skin | `poisoning` (شست‌وشوی پوست) | 🟡 فقط پاره‌ای |
| Chest pain | `heart-attack` | ✅ |
| Concussion | `head-injury` | ✅ |
| Dental avulsion | `dental-avulsion` | ✅ |
| Epistaxis | `nosebleed` | ✅ |
| **Exertional dehydration** | **ندارد** | ❌ |
| Extremity bleeding / direct pressure | `severe-bleeding` | ✅ |
| Fractures | `suspected-fracture` | ✅ |
| Frostbite | `frostbite` | ✅ |
| Hyperthermia & heat stroke | `heat-illness` | ✅ |
| Hypoglycemia | `diabetic-emergency` | ✅ |
| Hypothermia | `hypothermia` | ✅ |
| Jellyfish stings | `jellyfish-sting` | ✅ |
| Open chest wounds | `open-chest-wound` | ✅ |
| Opioid overdose | `opioid-overdose` | ✅ |
| **Poison ivy / poison oak / poison sumac** | **ندارد** | ❌ |
| Positioning of the ill/injured person | `unresponsive-breathing` (recovery) + `shock` | 🟡 پاره‌ای |
| Positioning of person in shock | `shock` | ✅ |
| Presyncope | `fainting` | ✅ |
| Recognition of stroke (adults) | `stroke` | ✅ |
| **Recognition of stroke (children)** | **ندارد** | ❌ |
| Seizures | `seizure` | ✅ |
| Severe external bleeding | `severe-bleeding` | ✅ |
| Snakebite | `snake-bite` | ✅ |
| **Spider & scorpion envenomation** | فقط `scorpion-sting` | 🟡 **پارتنش: گزش عنکبوت نیست** |
| Sprains & strains | `dislocation-sprain` | ✅ |
| Superficial wounds | `laceration` | ✅ |
| Suspected foreign body in the eye | `eye-foreign` | ✅ |
| **Suspected spinal injury** | فقط در `head-injury` / `suspected-fracture` / `unresponsive-breathing` | 🟡 **راهنمای مستقل ندارد** |
| Tick bites | `tick-removal` | ✅ |
| Administration of oxygen | ندارد | ❌ (ابزار، نه بیماری) |
| Use of pulse oximetry | ندارد | ❌ (ابزار، نه بیماری) |

---

## ۴) پوشش ILCOR 2025 First Aid CoSTR

| مبحث | وضعیت |
|---|---|
| Recovery position | ✅ |
| Glucose administration / dietary sugar for hypoglycemia | ✅ |
| Recognition of stroke | ✅ |
| **Recognition of sepsis** | ❌ |
| **Prevention of syncope with counter-pressure maneuvers** | ❌ (فقط خواباندن/بالا بردن پا در `fainting`) |
| **Spinal motion restriction** | 🟡/❌ (فقط اشاره در سایر کیس‌ها) |
| Hemostatic dressing | ✅ |
| Duration of cooling for burns | ✅ |
| Dental avulsion | ✅ |
| **Compression wrap for closed extremity joint injuries** | 🟡 (باند کشی خفیف در RICE، بدون مبحث مستقل) |
| Preservation of amputated body part | ✅ |
| **Exertion-related dehydration and rehydration** | ❌ |
| Tick removal | ✅ |
| **Postpartum hemorrhage / uterine massage** | ❌ |
| **Caustic agent attack** | 🟡 (فقط داخل `poisoning`) |
| Opioid-associated emergency | ✅ |
| Bronchodilator / asthma | ✅ |
| Jellyfish stings treatment | ✅ |
| Unintentional injury from chest compressions | 🟡 (فقط آموزش/محدودیت، نه کیس جدا) |

---

## ۵) پوشش ERC 2025 First Aid

| مبحث | وضعیت |
|---|---|
| Approach / positioning impaired responsiveness، recovery، shock position | ✅ |
| Choking، asthma، chest pain، hypoglycaemia، opioid overdose، stroke | ✅ |
| Cervical spinal motion restriction | 🟡/❌ (مستقل نیست) |
| Life-threatening bleeding، open chest wounds، concussion، amputation preservation | ✅ |
| Drowning، hypothermia، hyperthermia، snake bite | ✅ |
| **Suicidal thoughts** | ❌ |

---

## ۶) پوشش WHO Basic Emergency Care

| خروجی BEC | وضعیت |
|---|---|
| ABCDE / SAMPLE، Trauma، Difficulty breathing، Shock، Altered mental status | ✅ در سطح لِی (سطح فرد امدادگر) |
| Snake bite، animal bites، wound، fracture، burn | ✅ |
| Tension pneumothorax، flail chest، pericardial tamponade، large pleural effusion، advanced airway/BVM/needle decompression/pelvic binding | 🟡 **عمداً خارج از حیطهٔ «اولین نفر» (لِی ریسکیو)** — این‌ها حرفه‌ای/بیمارستانی‌اند و برای اپ «لِی» درست است که نباشند. |

---

## ۷) شکاف‌های اصلی (بیماری/آسیب در استانداردها ولی خارج از برنامه)

این‌ها را بر اساس اینکه در منابع استنادی پروژه «صریح» هستند و برای یک امدادگر غیرحرفه‌ای هم قابل‌اجرا، اولویت‌بندی کردم.

### اولویت بالا (P0) — پیشنهاد افزودن

| # | بیماری/آسیب | منبع | چرا مهم | چه چیزی لازم است |
|---|---|---|---|---|
| ۱ | **شناخت سپسیس (Sepsis)** | ILCOR 2025 (`Recognition of sepsis`) | علت شایع مرگ قابل‌پیشگیری؛ نشانه‌های «تب + تنفس سریع + گیجی/خواب‌آلودگی» برای افراد عادی قابل پایش است | کیس مستقل، نشانه‌های `fever`، `rapid_breathing`، `confusion`، `cold_extremities`، `mottled/pale` |
| ۲ | **دهیدراتاسیون ناشی از فعالیت / Exertional dehydration** | AHA 2024، ILCOR 2025، IFRC | بسیار شایع در گرمای ایران، ورزش، کار؛ مرتبط با گرمازدگی | کیس مستقل + نشانه‌های تشنگی/خشکی/کم‌ادراری/سرگیجه + ORS |
| ۳ | **گیاهان سمی پوستی (Poison ivy/oak/sumac و معادل‌های محلی/گیاه سوزش‌زا)** | AHA 2024 | در گایدلاین یک مبحث صریح است؛ شست‌وشو و کمپرس سرد راهنمای مشخص دارد | کیس `plant-skin-exposure` و نشانه‌های rash/itch/blister |
| ۴ | **گزش عنکبوت / Spider bite** | AHA 2024 (`Spider and scorpion envenomation`) | «اسکورپیون» هست، «عنکبوت» نیست؛ طبق گایدلاین باید علائم سیستمی و مراجعهٔ پزشکی را بررسی کرد | کیس `spider-bite` یا ادغام در `bite` |
| ۵ | **آسیب ستون فقرات / Suspected spinal injury** | AHA 2024، ILCOR 2025، ERC 2025 | الان فقط در دل کیس‌های دیگر اشاره می‌شود؛ هیچ «مسیر تصمیم» مستقل (نشانه‌های گردن/پشت/خواب‌رفتگی + مکانیسم ضربه) ندارد | کیس `spinal-injury` + نشانه‌های `back_pain`, `numbness`, `incontinence?`، مکانیسم/ویژگی پایدار |

### اولویت میانی (P1) — ارزش افزودن

| # | بیماری/آسیب | منبع | لازم است |
|---|---|---|---|
| ۶ | **شناخت سکتهٔ کودک** | AHA 2024 | کیس/بخش `stroke` فقط بزرگسال است؛ گایدلاین علائم کودکان (تغییر هوشیاری، تشنج، سردرد، عدم تعادل، دوبینی، تهوع) را جدا دارد |
| ۷ | **خونریزی پس از زایمان (PPH)** | ILCOR 2025 | مبحث صریح و جدید؛ حداقل ماساژ رحم و تماس فوری/نگرش «مادر باردار» |
| ۸ | **فکر خودکشی / مسائل روانی‌حرکتی و بحران روانی** | ERC 2025، IFRC | «پرسیدن مستقیم از فکر خودکشی، امید دادن، کمک به تماس با متخصص» راهنمای واضح دارد؛ برنامه هیچ‌بخش سلامت روان ندارد |
| ۹ | **علائم «بیماری داخلی» رایج‌تر: تب، درد شکم** | WHO BEC، IFRC | علامت `fever` اصلاً در `symptoms.json` نیست؛ درد شکم هم نیست. برای رساندن کاربر به مسیر «بدحالی/عفونت/سپسیس» لازم است |

### اولویت پایین (P2) — منابع/مداخلات یا خارج از حیطهٔ لِی

- **تزریق اکسیژن و پالس‌اکسیمتری** (AHA/ILCOR/ERC): اگر مخاطب فقط فرد عادی بدون دستگاه باشد، قابل رد است؛ اگر مخاطب «امدادگر آموزش‌دیده» باشد، شکاف است.
- **حرکات ضدفشار (counter-pressure maneuvers)** برای پیشگیری سنکوپ (ILCOR 2025).
- **پانسمان فشاری/باند فشاری تخصصی برای مفصل بسته** (ILCOR/ERC).
- **حملات مادهٔ سوزاننده (caustic attack)** — در حال حاضر داخل `poisoning` است و می‌تواند مستقل شود.
- موارد BEC حرفه‌ای (نیلی‌دکومپرشن، تورن‌دکست‌فشاری…): **عمداً باید خارج بماند**؛ برای این اپ اشتباه است که آن‌ها را اضافه کند.

---

## ۸) نکته‌های تکمیلی دربارهٔ کامل‌بودن داده‌ها

- **پاریتی فارسی/انگلیسی:** ✅ هر دو پایگاه ۳۵ کیس با همان شناسه‌ها دارند؛ بدون اختلاف (`.diff` بین `kb` و `kb-en` فقط نثر است که طبق طراحی تفکیک شده).
- **متری و واحد:** ✅ پروژه واحد اصلی متریک است؛ در CPR، تورنیکه، دمای بازگرم‌سازی واحد دوم هم آمده است.
- **پروفایل کشور:** 🟡 ۵۶ کشور پروفایل تأییدشده دارند؛ ۱۹۳ کشور بدون پروفایل فقط «تماس با اورژانس محلی» را نمایش می‌دهند. این با فلسفهٔ «حدس شماره نزن» سازگار است، نه شکاف پزشکی.
- **گزارش پزشکی صادقانه:** ✅ هر کیس `sources` و وضعیت «بازبینی پزشکی انسانی» را نشان می‌دهد؛ خوانندگان از حد نمی‌گذرند.

---

## ۹) پیشنهاد سفارش کار بعدی

به‌نظرم ترتیب منطقی برای بستن شکاف‌های اصلی:

1. **سپسیس و تب** — یک ماژول «بیماری داخلی» با `fever`، تنفس سریع، گیجی، بدن سرد/مرمری.
2. **هیدراتاسیون/دهیدراتاسیون** — جدا از گرمازدگی؛ چون در استانداردها مبحث مستقل است.
3. **بستهٔ «گزش و تماس»**: گزش عنکبوت + گیاهان سوزش‌زا (poison ivy و معادل‌های محلی).
4. **آسیب ستون فقرات** — به‌صورت کیس مستقل با «مکانیسم + علائم هشدار + قانون جابه‌جا نکردن».
5. **سکتهٔ کودک** — الحاق به `stroke`، بدون تغییر الگوریتم بزرگسال.
6. **خونریزی پس از زایمان و افکار خودکشی** — اگر دامنهٔ استانداردها (ILCOR/ERC 2025) را دنبال می‌کنید.
7. اگر مخاطب «امدادگر با تخصص» باشد، **اکسیژن/پالس‌اکسیمتری** را به‌عنوان بخش «تجهیزات» اضافه کنید؛ در غیر این صورت صریحاً «خارج از حیطه» علامت بزنید.

با هر تغییر، طبق راهنمای پروژه: فایل JSON را ویرایش، `version`/`updatedAt` را افزایش، `sources` را ثبت و سپس `build-manifest`، `validate` و `test/run-tests.mjs` را اجرا کنید.

---

*این گزارش فقط «ممیزی پوشش» است و توصیهٔ پزشکی یا جایگزین بازبینی پزشک/کمیتهٔ پزشکی محسوب نمی‌شود.*
