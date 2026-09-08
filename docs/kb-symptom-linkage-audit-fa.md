# گزارش ممیزی «اتصال نشانه → کیس» در پایگاه دانش امدادگر

- **تاریخ:** ۲۰۲۶-۰۹-۰۷
- **هدف:** پیدا کردن نشانه‌هایی که در `kb/symptoms.json` وجود دارند ولی یا به کیس اشتباه / فقط یک کیس وصل‌اند، یا اصلاً به کیس‌هایی که باید وصل باشند متصل نیستند.
- **پس‌زمینه:** نمونهٔ `ptosis` که کاربر مطرح کرد درست بود؛ بررسی سراسری نشان می‌دهد موردهای مشابه دیگری هم وجود دارند.
- **منبع داده:** `kb/symptoms.json` + همهٔ `kb/cases/*.json` (انگلیسی `kb-en/` هم بنا به پاریتی ساختاری همان منطق را دارد).

---

## ۱) آمار کلی اتصال

| دسته | تعداد |
|---|---|
| کل نشانه‌ها | ۹۰ |
| نشانه با حداقل ۱ اتصال | ۸۹ |
| نشانه بدون هر اتصال | ۱ (`conscious` — طبیعی، فقط برای تریاژ است) |
| نشانه وصل‌شده فقط به ۱ کیس | ۴۱ |
| نشانه وصل‌شده فقط به ۲ کیس | ۲۲ |

---

## ۲) نشانه‌هایی که «واقعاً باید به کیس بیشتری وصل باشند»

این‌ها همان «چیزهایی هستند که کاربر ندیده بود». نشانه‌ها علائم عمومی‌اند که در چند وضعیت بالینی مشترک‌اند، اما الان فقط در یک یا دو کیس استفاده شده‌اند.

### A. مشکل مسیر «ماده شیمیایی»

| نشانه | اتصال فعلی | باید به این‌ها هم وصل شود |
|---|---|---|
| `chemical_contact` | فقط `eye-foreign` | **`poisoning`** (تماس پوستی/چشمی/تنفسی)، و به‌صورت منطقی `thermal-burn` (سوختگی شیمیایی) — پیش‌نیاز دستهٔ `burn` هم هست |

> این یکی از مهم‌ترین یافته‌هاست: اگر کاربر «تماس با مادهٔ شیمیایی» را انتخاب کند ولی چشم درگیر نباشد، موتور به `poisoning` نمی‌رسد؛ در حالی که همین نشانه در دستهٔ `burn` هم `diffSymptoms` است.

### B. نشانه‌های عصبی/چشمی که باید در «سکته» و «ضربه سر» دیده شوند

| نشانه | اتصال فعلی | باید به این‌ها هم وصل شود |
|---|---|---|
| `ptosis` | `snake-bite` | `stroke` (درگیری عصبی/هورنر/brainstem)، `head-injury` (ضربهٔ چشم/صورت/گردن)، `scorpion-sting` (عقرب نوروتوکسیک) |
| `severe_headache` | `head-injury` | `stroke` (سردرد ناگهانی/خونریزی زیرعنکبوتیه)، `poisoning` (مثل CO) |
| `unequal_pupils` | `head-injury` | `stroke` (درگیری ساقهٔ مغز/عصب سوم) |
| `speech_difficulty` | `breathing-difficulty`, `stroke` | `head-injury` (افت عملکرد عصبی پس از ضربه)، `diabetic-emergency` (افت قند)، `poisoning` (مسمومیت) |
| `facial_droop` | فقط `stroke` | `head-injury` (نشانهٔ نورولوژیک پس از ضربه) |
| `arm_weakness` | `heart-attack`, `stroke` | `head-injury` (ضعف یک طرفه پس از ضربه)، `diabetic-emergency` (افت قند) |
| `neck_pain` | فقط `head-injury` | `suspected-fracture` / `unresponsive-breathing` (آسیب ستون فقرات)، `stroke` (تشریح کاروتید) |
| `seizure_activity` | `head-injury`, `poisoning`, `seizure`, `unresponsive-breathing` | `heat-illness` (گرمازدگی)، `diabetic-emergency` (هیپوگلیسمی)، `hypothermia` (هیپوترمی شدید)، `stroke` (تشنج به‌عنوان تظاهر سکته) |
| `time_onset` | فقط `stroke` | `heart-attack`، `seizure`، `head-injury` (آخرین زمان سلامت) |

### C. نشانه‌های عمومی بدحالی

| نشانه | اتصال فعلی | باید به این‌ها هم وصل شود |
|---|---|---|
| `dizziness` | `fainting`, `nosebleed`, `severe-bleeding`, `shock`, `snake-bite`, `stroke` | `diabetic-emergency`، `heat-illness` (خستگی گرمایی)، `anaphylaxis`، `poisoning`، `head-injury`، `scorpion-sting` |
| `nausea_vomiting` | `fainting`, `heart-attack`, `heat-illness`, `jellyfish-sting`, `poisoning`, `snake-bite` | `scorpion-sting`، `stroke`، `head-injury`، `diabetic-emergency`، `anaphylaxis`، `severe-bleeding`/`shock` |
| `sweating_cold` | `diabetic-emergency`, `fainting`, `heart-attack`, `scorpion-sting`, `severe-bleeding`, `shock` | `anaphylaxis` (عرق سرد)، `poisoning` |
| `chest_pain` | `breathing-difficulty`, `cardiac-arrest`, `fainting`, `heart-attack`, `shock` | `electric-shock` (نشانهٔ خطر پس از برق‌گرفتگی)، `poisoning` (CO)، `anaphylaxis` (سفتی قفسهٔ سینه) |
| `cyanosis` | `breathing-difficulty`, `cardiac-arrest`, `choking`, `drowning`, `open-chest-wound` | `poisoning` (CO/مسمومیت)، `opioid-overdose` (هیپوکسی) |

### D. نشانه‌های «زمینه‌ای» که کم‌اتصال‌اند

| نشانه | اتصال فعلی | باید به این‌ها هم وصل شود |
|---|---|---|
| `known_diabetic` | `diabetic-emergency`, `seizure`, `unresponsive-breathing` | `stroke` (چک قند/شبیه‌سازی هیپوگلیسمی)، `fainting` |
| `heart_known` | فقط `heart-attack` | `fainting` (سینکوپ قلبی)، `shock`، `breathing-difficulty` (علت قلبی تنگی نفس) |
| `blood_thinner` | `head-injury`, `nosebleed` | `severe-bleeding`، `laceration`، `dental-avulsion` (خطر خونریزی) |
| `child_victim` | `breathing-difficulty`, `choking`, `heat-illness`, `jellyfish-sting`, `scorpion-sting`, `seizure`, `thermal-burn` | `cardiac-arrest` (راهنمای CPR کودک/شیرخوار)، `stroke` (شناخت سکتهٔ کودک) |
| `elderly_victim` | `heat-illness`, `hypothermia`, `scorpion-sting` | `stroke`، `fainting`، `heart-attack`، `nosebleed` (در سالمندان اورژانسی‌تر است)، `severe-bleeding` |
| `pregnant` | `fainting`, `seizure` | `choking` (فشار قفسهٔ سینه در بارداری پیشرفته)، `anaphylaxis` (پوزیشن پهلوی چپ)، `poisoning` |

### E. نشانه‌های «خونریزی/زخم»

| نشانه | اتصال فعلی | باید به این‌ها هم وصل شود |
|---|---|---|
| `bleeding_heavy` | `animal-bite`, `dental-avulsion`, `open-chest-wound`, `severe-bleeding`, `shock`, `traumatic-amputation` | `laceration` (زخم باز خون‌ریزدهنده) |
| `bleeding_persistent` | `dental-avulsion`, `nosebleed` | `severe-bleeding`، `laceration`، `animal-bite` |
| `shock_signs` | `shock`, `traumatic-amputation` | `severe-bleeding` (خونریزی → شوک)، `anaphylaxis` |
| `swelling_spreading` | فقط `snake-bite` | `bee-wasp-sting` و `scorpion-sting` (گسترش تورم پس از نیش) |
| `bruising` | `scorpion-sting`, `snake-bite` | `head-injury` (کبودی پوست سر)، `laceration`/تروما که بعداً قابل بررسی است |

### F. نشانه‌های آنافیلاکسی

| نشانه | اتصال فعلی | باید به این‌ها هم وصل شود |
|---|---|---|
| `throat_tightness` | `anaphylaxis`, `bee-wasp-sting` | `jellyfish-sting` (آنافیلاکسی در نیش عروس دریایی) |
| `known_allergen_exposure` | `anaphylaxis`, `bee-wasp-sting` | `jellyfish-sting` |

---

## ۳) نشانه‌هایی که «فقط یک کیس» داشتنشان **صحیح** است (نباید دست زد)

این‌ها triggerهای اختصاصی همان آسیب‌اند و اشتباه نیست که فقط به یک کیس وصل شوند:

`saw_snake`, `two_punctures`, `scorpion_seen`, `stinger_visible`, `multiple_stings`, `tick_attached`, `burn_face_hands_feet`, `burn_large`, `burn_deep`, `soot_nose`, `stuck_clothing`, `electrical_contact`, `open_fracture`, `fruity_breath`, `kussmaul`, `hot_dry_skin`, `hot_flushed`, `coughing_effort`, `drowning_recent`, `container_available`, `embedded_eye`, `seizure_long`, `frostbitten_skin`, `tooth_knocked_out`, `open_chest_wound`, `amputated_part`, `jellyfish_sting`.

---

## ۴) نشانه‌های **کاملاً غایب** که برای کیس‌های اصلی استاندارد لازم‌اند

این‌ها در `symptoms.json` اصلاً تعریف نشده‌اند؛ همان شکاف‌هایی که در گزارش قبلی (پوشش استانداردها) هم آمد:

| نشانه غایب | برای اینکه |
|---|---|
| `fever` / `high_temp` | **شناخت سپسیس** (ILCOR 2025)، عفونت، گرمازدگی‌گونه |
| `rapid_breathing` | سپسیس، حملهٔ تنفسی، شوک |
| `abdominal_pain` | بدحالی عمومی، خونریزی داخلی، مراجعهٔ پزشکی |
| `sudden_severe_headache` (غیرتروما) | سکته، خونریزی زیرعنکبوتیه |
| `back_pain` / `paralysis` / `bowel_bladder_change` | **آسیب ستون فقرات** |
| `double_vision` / `blurred_vision` / `ataxia` | سکتهٔ پشتی/ساقهٔ مغز، ضربهٔ سر |
| `dehydration_signs` (تشنگی، خشکی، کم‌ادراری) | **دهیدراتاسیون ناشی از فعالیت** |
| `paleness` / `mottled_skin` | شوک، سپسیس |
| `sudden_weakness_face_limb` | سکته — الان `facial_droop` و `arm_weakness` دارد ولی بدون علائم چشمی/تعادلی |

---

## ۵) اولویت پیشنهادی اصلاح

### فاز ۱ (بازخورد مستقیم کاربر + خطای مسیر واضح)
1. `ptosis` → `stroke` + `head-injury` + `scorpion-sting` (و برچسب خنثی شود)
2. `chemical_contact` → `poisoning` (و بررسی `thermal-burn`)
3. `severe_headache`, `unequal_pupils`, `facial_droop`, `arm_weakness`, `speech_difficulty` → `head-injury` / `stroke` هر جا منطقی است
4. `neck_pain` → `suspected-fracture`, `unresponsive-breathing`, `stroke`

### فاز ۲ (علائم عمومی بدحالی)
5. `dizziness`, `nausea_vomiting`, `sweating_cold`, `cyanosis`, `chest_pain` → کیس‌های ذکرشده در جدول بالا
6. `blood_thinner`, `bleeding_persistent`, `shock_signs` → `severe-bleeding` / `laceration`

### فاز ۳ (زمینه/سن/بارداری)
7. `child_victim` → `cardiac-arrest`, `stroke`
8. `pregnant` → `choking`, `anaphylaxis`
9. `elderly_victim` → `stroke`, `fainting`, `heart-attack`, `nosebleed`

### فاز ۴ (نشانه‌های غایب — نیاز به کیس جدید)
10. `fever`, `rapid_breathing`, `dehydration_signs`, `double_vision`, `bove` … → فرصت برای **سپسیس/دهیدراتاسیون/سکتهٔ کودک/آسیب ستون فقرات**

---

## ۶) نحوهٔ اعمال امن

۱. برای هر تغییر، `kb/symptoms.json` و `kb/cases/*.json` و معادل `kb-en/` هم‌زمان ویرایش شوند (پاریتی ساختاری الزامی است).
۲. `version` هر کیس و `updatedAt` افزایش یابد؛ `sources` اضافه/به‌روز شود.
۳. در صورت تغییر برچسب نشانه، `aliases` فارسی/انگلیسی هماهنگ شود.
۴. سپس:
```bash
node tools/build-manifest.mjs kb --date YYYY-MM-DD
node tools/build-manifest.mjs kb-en --date YYYY-MM-DD
node tools/validate.mjs kb
node tools/validate.mjs kb-en
node test/run-tests.mjs
```

---

*این گزارش ممیزی «اتصال داده» است و جایگزین بازبینی پزشک/کمیتهٔ پزشکی نیست.*
