let uiLanguage = 'ar';
const originalText = new WeakMap();
const originalAttrs = new WeakMap();
const english = new Map(Object.entries({
  'ذكرني': 'Remember Me', 'مساحة ليومك': 'Space for your day', 'مهمة جديدة': 'New task', 'مساحتك': 'Your space',
  'يومي': 'Today', 'القادمة': 'Upcoming', 'كل المهام': 'All tasks', 'ملاحظاتي': 'My notes', 'المكتملة': 'Completed', 'الإعدادات': 'Settings',
  'تذكيراتك معك': 'Your reminders stay active', 'إغلاق النافذة يُبقي ذكرني بجانب الساعة': 'Closing the window keeps Remember Me near the clock',
  'مساحتي': 'My space', 'ابحث عن مهمة أو ملاحظة…': 'Search tasks or notes…', 'إضافة مهمة': 'Add task',
  'مساحة أهدأ، يوم أوضح': 'A calmer space, a clearer day', 'كل شيء يبدأ بخطوة.': 'Everything starts with one step.',
  'أضف ما يشغلك، وحدّد وقته. نحن هنا لنذكّرك.': 'Add what matters and set its time. We will remind you.',
  'ما أول شيء تريد إنجازه؟': 'What would you like to finish first?', 'بانتظار خطوتك': 'Waiting for you', 'مهام اليوم': "Today's tasks",
  'تذكيرك القادم': 'Next reminder', 'لا يوجد': 'None', 'مساحة لخطط جديدة': 'Room for new plans', 'أنجزت اليوم': 'Completed today',
  'كل خطوة تُحسب': 'Every step counts', 'حسب الموعد': 'By due time', 'حسب الأولوية': 'By priority', 'الأحدث أولًا': 'Newest first',
  'الكل': 'All', 'أولوية عالية': 'High priority', 'أضف مهمة سريعة…': 'Add a quick task…', 'إضافة': 'Add',
  'مساحة جديدة لبداية لطيفة': 'A fresh space for a gentle start', 'اكتب مهمة صغيرة، فكرة مهمة، أو شيئًا لا تريد نسيانه.': "Write a small task, an idea, or anything you don't want to forget.",
  'أضف مهمتك الأولى': 'Add your first task', 'عندما يحين الموعد، يبقى التنبيه ظاهرًا حتى تنجز المهمة أو تؤجّلها.': 'When the time comes, the alert stays visible until you complete or snooze it.',
  'أفكارك تستحق مكانًا': 'Your ideas deserve a place', 'ملاحظات بسيطة لكل ما يدور في بالك، محفوظة على جهازك.': 'Simple notes for anything on your mind, saved on your device.',
  'اكتب ملاحظتك الأولى': 'Write your first note', 'التذكيرات والخلفية': 'Reminders and background', 'صوت عند وصول التذكير': 'Play a reminder sound',
  'صوت واحد عند ظهور تنبيه جديد.': 'One sound when a new alert appears.', 'التشغيل مع ويندوز': 'Start with Windows', 'يفتح ذكرني في الخلفية عند تسجيل الدخول.': 'Opens Remember Me in the background when you sign in.',
  'مكان التنبيه': 'Alert position', 'أسفل الشاشة الرئيسية، فوق شريط المهام.': 'At the bottom of the main screen, above the taskbar.', 'الجهة اليمنى': 'Right side', 'الجهة اليسرى': 'Left side',
  'اللغة': 'Language', 'اختر لغة واجهة البرنامج.': 'Choose the app interface language.', 'العربية': 'Arabic', 'English': 'English',
  'شاهد التنبيه بنفسك': 'Preview the alert', 'جرّب شكله وأزرار الإنجاز والتأجيل.': 'Try its layout, complete button, and snooze options.', 'تجربة التنبيه': 'Preview alert',
  'بياناتك، على جهازك': 'Your data, on your device', 'يعمل ذكرني دون حساب أو اتصال بالإنترنت. تُحفظ المهام والملاحظات تلقائيًا مع نسخة احتياطية من آخر حفظ.': 'Remember Me works without an account or internet connection. Tasks and notes are saved automatically with a backup of the previous save.',
  'تصدير نسخة احتياطية': 'Export backup', 'فتح مجلد البيانات': 'Open data folder', 'النسخ الاحتياطي إلى Google Drive': 'Backup to Google Drive',
  'نسخة كاملة من المهام والملاحظات والصور والمرفقات. اختر مجلدًا داخل Google Drive المتزامن؛ يرفع تطبيق Google Drive الملفات إلى حسابك، ويحتفظ ذكرني بنسخة محلية أيضًا.': 'A complete copy of tasks, notes, images, and attachments. Choose a synced Google Drive folder; Google Drive uploads it to your account while Remember Me also keeps a local copy.',
  'اختيار مجلد Google Drive': 'Choose Google Drive folder', 'تثبيت Google Drive وتسجيل الدخول': 'Install Google Drive and sign in', 'نسخة تلقائية كل يوم': 'Automatic daily backup',
  'أثناء تشغيل ذكرني. تُعاد محاولة النسخ عند عودة مجلد Drive.': 'While Remember Me is running. Backup retries when the Drive folder returns.', 'نسخ احتياطي الآن': 'Back up now', 'فتح مجلد النسخ': 'Open backup folder',
  'كيف تبقى التذكيرات فعّالة؟': 'How do reminders stay active?', 'أغلق النافذة بشكل طبيعي؛ يبقى ذكرني بجانب الساعة. للخروج الكامل استخدم قائمته هناك. أثناء إيقاف الجهاز أو سكونه لا يمكن إظهار تنبيه، وستظهر التذكيرات الفائتة عند العودة وتشغيل البرنامج. الوقت المعتمد هو توقيت جهازك.': 'Close the window normally and Remember Me stays by the clock. Use its tray menu to exit fully. Alerts cannot appear while the PC is off or asleep; missed reminders appear when you return. The app uses your device time.',
  'خطوة جديدة': 'A new step', 'مساحة لمهمة جديدة': 'Space for a new task', 'ما الذي تريد إنجازه؟': 'What would you like to complete?', 'مثلًا: مراجعة خطة الأسبوع': 'For example: Review the weekly plan',
  'تفاصيل وملاحظات': 'Details and notes', 'اختياري': 'Optional', 'كل التفاصيل التي تساعدك على البدء…': 'Anything that helps you get started…', 'المرفقات': 'Attachments', 'إضافة ملفات': 'Add files',
  'PDF وExcel وأي ملف تحتاجه • حتى 50 ميغابايت للملف. نحفظ نسخة مع المهمة.': 'PDF, Excel, or any file you need • up to 50 MB each. A copy is saved with the task.',
  'الأولوية': 'Priority', 'عادية': 'Normal', 'متوسطة': 'Medium', 'عالية': 'High', 'ذكّرني بهذه المهمة': 'Remind me about this task', 'بعد 10 دقائق': 'In 10 minutes', 'بعد ساعة': 'In one hour', 'غدًا': 'Tomorrow',
  'موعد التذكير': 'Reminder time', 'التكرار': 'Repeat', 'مرة واحدة': 'Once', 'كل يوم': 'Daily', 'كل أسبوع': 'Weekly', 'يبقى التنبيه حتى تختار «تم» أو «ذكّرني لاحقًا».': 'The alert stays until you choose Done or Snooze.',
  'إلغاء': 'Cancel', 'حفظ المهمة': 'Save task', 'لا تدع الفكرة تفوتك': "Don't let the idea slip away", 'ملاحظة جديدة': 'New note', 'عنوان الملاحظة': 'Note title', 'فكرة تستحق الاحتفاظ بها…': 'An idea worth keeping…',
  'الملاحظة': 'Note', 'اكتب بحرية…': 'Write freely…', 'أرفق PDF أو Excel أو أي ملف بجانب ملاحظتك. نحفظ نسخة مستقلة حتى 50 ميغابايت للملف.': 'Attach a PDF, Excel sheet, or any file to your note. We keep an independent copy up to 50 MB.',
  'لون الملاحظة': 'Note color', 'كريمي': 'Cream', 'أخضر هادئ': 'Soft green', 'أزرق': 'Blue', 'وردي': 'Pink', 'حفظ الملاحظة': 'Save note',
  'حذف هذا العنصر؟': 'Delete this item?', 'سيُحذف من قائمتك. لا يمكن التراجع عن الحذف.': 'It will be removed from your list. This cannot be undone.', 'حذف': 'Delete',
  'تذكير لك': 'A reminder for you', 'حان الموعد': 'It is time', 'مساحة صغيرة لشيء مهم': 'A small space for something important', 'تم، أنجزتها': 'Done, completed',
  'أو ذكّرني لاحقًا': 'Or remind me later', '5 دقائق': '5 minutes', '15 دقيقة': '15 minutes', 'ساعة': '1 hour', '24 ساعة': '24 hours', 'اختر موعدًا آخر': 'Choose another time',
  'سأبقى هنا حتى تنجزها أو تختار وقتًا آخر.': 'I will stay here until you complete it or choose another time.', 'فتح ذكرني': 'Open Remember Me'
}));
function tr(ar, en) { return uiLanguage === 'en' ? en : ar; }
function setLanguage(language) {
  uiLanguage = language === 'en' ? 'en' : 'ar';
  document.documentElement.lang = uiLanguage; document.documentElement.dir = uiLanguage === 'en' ? 'ltr' : 'rtl';
  const alertPage = document.body.classList.contains('alert-body');
  document.title = uiLanguage === 'en' ? `Remember Me • ${alertPage ? 'Reminder' : 'Your day'}` : `ذكرني • ${alertPage ? 'حان الموعد' : 'مساحة ليومك'}`;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node; while ((node = walker.nextNode())) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node), trimmed = source.trim();
    if (!trimmed || !english.has(trimmed)) { if (uiLanguage === 'ar') node.nodeValue = source; continue; }
    node.nodeValue = uiLanguage === 'en' ? source.replace(trimmed, english.get(trimmed)) : source;
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],[alt]')) {
    if (!originalAttrs.has(el)) originalAttrs.set(el, {});
    const saved = originalAttrs.get(el);
    for (const attr of ['placeholder','title','aria-label','alt']) if (el.hasAttribute(attr)) {
      saved[attr] ??= el.getAttribute(attr); const source = saved[attr];
      el.setAttribute(attr, uiLanguage === 'en' ? (english.get(source) || source) : source);
    }
  }
}
