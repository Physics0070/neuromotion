export type Lang = 'en' | 'hi' | 'mr'
export type CueKey =
  | 'ready' | 'raise' | 'higher' | 'good' | 'lean' | 'elbow' | 'reposition' | 'rep_done' | 'stop'
  | 'still' | 'set_done' | 'rest' | 'hang'

// The first nine are verbatim from core.py; still, set_done, rest and hang are web-only.
// Hindi and Marathi are an unreviewed draft.
export const CUES: Record<Lang, Record<CueKey, string>> = {
  en: {
    ready: 'Ready. Raise the arm forward and up.',
    raise: 'Raise the arm slowly.',
    higher: 'A little higher.',
    good: 'Good! Now lower slowly.',
    lean: 'Stop - body is leaning. Sit straight and try again.',
    elbow: 'Keep the elbow straight.',
    reposition: 'Move back or turn so the whole arm and body are visible.',
    rep_done: 'One repetition done.',
    stop: "STOP. Rest and follow your physiotherapist's advice.",
    still: 'Keep the upper arm still.',
    set_done: 'Set complete. Well done.',
    rest: 'Rest. The next set starts when the timer ends.',
    hang: 'Let the arm hang by your side and hold still.',
  },
  hi: {
    ready: 'तैयार। हाथ को आगे से ऊपर उठाइए।',
    raise: 'हाथ को धीरे-धीरे ऊपर उठाइए।',
    higher: 'थोड़ा और ऊपर।',
    good: 'बहुत अच्छा! अब धीरे-धीरे नीचे लाइए।',
    lean: 'रुकिए - शरीर झुक रहा है। सीधे बैठें और फिर से करें।',
    elbow: 'कोहनी सीधी रखिए।',
    reposition: 'पीछे हटें या मुड़ें ताकि पूरा हाथ और शरीर दिखे।',
    rep_done: 'एक बार पूरा हुआ।',
    stop: 'रुकिए। आराम करें और फिज़ियोथेरेपिस्ट की सलाह मानें।',
    still: 'ऊपरी बाँह को स्थिर रखिए।',
    set_done: 'सेट पूरा हुआ। शाबाश।',
    rest: 'आराम करें। टाइमर ख़त्म होने पर अगला सेट शुरू होगा।',
    hang: 'हाथ को बगल में लटकने दीजिए और स्थिर रहिए।',
  },
  mr: {
    ready: 'तयार. हात पुढून वर उचला.',
    raise: 'हात हळूहळू वर उचला.',
    higher: 'थोडे आणखी वर.',
    good: 'छान! आता हळूहळू खाली आणा.',
    lean: 'थांबा - शरीर वाकत आहे. सरळ बसा आणि पुन्हा करा.',
    elbow: 'कोपर सरळ ठेवा.',
    reposition: 'मागे सरका किंवा वळा, म्हणजे पूर्ण हात आणि शरीर दिसेल.',
    rep_done: 'एक वेळ पूर्ण झाले.',
    stop: 'थांबा. विश्रांती घ्या आणि फिजिओथेरपिस्टचा सल्ला पाळा.',
    still: 'वरचा हात स्थिर ठेवा.',
    set_done: 'सेट पूर्ण झाला. शाबास.',
    rest: 'विश्रांती घ्या. टायमर संपल्यावर पुढील सेट सुरू होईल.',
    hang: 'हात बाजूला सोडा आणि स्थिर रहा.',
  },
}

// DRAFT wording, verbatim from core.py: needs a native-speaking clinician and whoever signs off consent text.
export const CONSENT: Record<Lang, { use: string; share: string }> = {
  en: {
    use:
      "Before we start: this app uses this device's camera to measure arm movement. It saves only numbers (angles and repetition counts), never video or photos. You can stop at any time. The patient or their guardian must agree. This is a practice aid, not a doctor. If the patient feels pain, press stop. Do you agree?",
    share:
      "Share this session's results with the patient's physiotherapist under ABHA address {abha}? Only angles and counts are shared. If you say no, the results stay unnamed.",
  },
  hi: {
    use:
      'शुरू करने से पहले: यह ऐप इस डिवाइस के कैमरे से हाथ की गति नापता है। यह केवल संख्याएँ (कोण और बार की गिनती) सहेजता है, कोई वीडियो या फ़ोटो नहीं। आप कभी भी रुक सकते हैं। मरीज़ या उनके अभिभावक की सहमति ज़रूरी है। यह अभ्यास में मदद करने वाला साधन है, डॉक्टर नहीं। अगर मरीज़ को दर्द हो तो रुकें का बटन दबाएँ। क्या आप सहमत हैं?',
    share:
      'क्या इस सत्र के परिणाम मरीज़ के फिज़ियोथेरेपिस्ट के साथ ABHA पते {abha} के अंतर्गत साझा करें? केवल कोण और गिनती साझा होगी। नहीं कहने पर परिणाम बिना नाम के रहेंगे।',
  },
  mr: {
    use:
      'सुरू करण्यापूर्वी: हे अ‍ॅप या उपकरणाच्या कॅमेऱ्याने हाताची हालचाल मोजते. ते फक्त आकडे (कोन आणि वेळांची संख्या) जतन करते, कोणताही व्हिडिओ किंवा फोटो नाही. तुम्ही केव्हाही थांबू शकता. रुग्ण किंवा त्यांच्या पालकांची संमती आवश्यक आहे. हे सरावासाठी मदत करणारे साधन आहे, डॉक्टर नाही. रुग्णाला वेदना झाल्यास थांबा बटण दाबा. तुम्ही सहमत आहात का?',
    share:
      'या सत्राचे निकाल रुग्णाच्या फिजिओथेरपिस्टसोबत ABHA पत्ता {abha} अंतर्गत शेअर करायचे का? फक्त कोन आणि संख्या शेअर होतील. नाही म्हटल्यास निकाल बिनानावाचे राहतील.',
  },
}

export const LANGS: { id: Lang; label: string; name: string; tag: string }[] = [
  { id: 'en', label: 'EN', name: 'English', tag: 'en-IN' },
  { id: 'hi', label: 'हि', name: 'Hindi', tag: 'hi-IN' },
  { id: 'mr', label: 'मर', name: 'Marathi', tag: 'mr-IN' },
]

// The hero arm moves through these beats as the page scrolls; the label is shown in the readout.
export const BEATS = ['Zero degrees', 'Lifting', 'Target reached', 'Flagged', 'SafeCue', 'Settled']

// DRAFT wording: the physiotherapist signs off the items, a native speaker signs off hi and mr (src/release.json).
export const SAFETY: Record<Lang, { emergency: string; screenTitle: string; screen: string[]; confirm: string }> = {
  en: {
    emergency: 'Call 108 or 112 now for a sudden drooping face, new weakness or numbness, trouble speaking or seeing, a severe headache, or chest pain. Do not exercise.',
    screenTitle: 'Do not exercise today if any of these is true',
    screen: [
      'Chest pain, breathlessness or dizziness',
      'Fever, or feeling unwell',
      'New or worsening weakness or numbness',
      'A painful, swollen or recently injured shoulder, arm or neck',
      'Your doctor or physiotherapist has told you to rest',
    ],
    confirm: 'I have checked. None of these is true today.',
  },
  hi: {
    emergency: 'अचानक चेहरा टेढ़ा होना, नई कमज़ोरी या सुन्नपन, बोलने या देखने में दिक्कत, तेज़ सिरदर्द या सीने में दर्द हो तो तुरंत 108 या 112 पर कॉल करें। व्यायाम न करें।',
    screenTitle: 'इनमें से कुछ भी सही हो तो आज व्यायाम न करें',
    screen: [
      'सीने में दर्द, साँस फूलना या चक्कर आना',
      'बुखार, या तबीयत ठीक न लगना',
      'नई या बढ़ती कमज़ोरी या सुन्नपन',
      'कंधे, बाँह या गर्दन में दर्द, सूजन या हाल की चोट',
      'डॉक्टर या फिज़ियोथेरेपिस्ट ने आराम करने को कहा है',
    ],
    confirm: 'मैंने जाँच लिया है। आज इनमें से कुछ भी सही नहीं है।',
  },
  mr: {
    emergency: 'अचानक चेहरा वाकडा होणे, नवीन अशक्तपणा किंवा बधिरपणा, बोलण्यात किंवा दिसण्यात अडचण, तीव्र डोकेदुखी किंवा छातीत दुखणे असल्यास लगेच 108 किंवा 112 वर कॉल करा. व्यायाम करू नका.',
    screenTitle: 'यापैकी काहीही खरे असेल तर आज व्यायाम करू नका',
    screen: [
      'छातीत दुखणे, धाप लागणे किंवा चक्कर येणे',
      'ताप, किंवा बरे वाटत नसणे',
      'नवीन किंवा वाढणारा अशक्तपणा किंवा बधिरपणा',
      'खांदा, हात किंवा मान दुखणे, सूज किंवा अलीकडील इजा',
      'डॉक्टर किंवा फिजिओथेरपिस्टने विश्रांती घ्यायला सांगितले आहे',
    ],
    confirm: 'मी तपासले आहे. आज यापैकी काहीही खरे नाही.',
  },
}
