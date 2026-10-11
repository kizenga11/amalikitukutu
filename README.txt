LESSON PLAN GENERATOR - MODULI MPYA (ADDITIVE)
==============================================
Faili zote ni MPYA. Hakuna faili la mfumo uliopo linalobadilishwa.

YALIYOMO
--------
supabase/migrations/lp_001_lesson_plans.sql   -> jedwali 5 (prefix lp_)
lib/lp/db.ts                                  -> Supabase client (seva tu)
lib/lp/auth.ts                                -> getLpUser(): UNGANISHA NA LOGIN YAKO (TODO)
lib/lp/generate.ts                            -> mantiki ya hatua 4 na dakika
app/lesson-plans/actions.ts                   -> seed, generate, save
app/lesson-plans/page.tsx                     -> ukurasa wa mwalimu
app/lesson-plans/Generator.tsx                -> chagua Somo > Topic > Subtopic
app/lesson-plans/[id]/page.tsx + PlanEditor.tsx -> hariri na chapisha (muundo wa TIE)
app/lesson-plans/admin/page.tsx + SeedForm.tsx  -> ukurasa wa mkuu (seed silabasi)

JINSI YA KUWEKA
---------------
1. Fanya branch ya git kwanza: git checkout -b lesson-plans
2. Nakili folda "app/lesson-plans", "lib/lp" kwenye project (kama unatumia src/, weka ndani ya src/).
3. Endesha SQL kwenye Supabase SQL Editor (bora project ya majaribio kwanza).
4. Hakikisha .env.local ina:
     NEXT_PUBLIC_SUPABASE_URL=...
     SUPABASE_SERVICE_ROLE_KEY=...   (BILA NEXT_PUBLIC_, usiiweke kwenye client)
5. Kama bado hujasakinisha: npm i @supabase/supabase-js
6. Fungua lib/lp/auth.ts na uunganishe getLpUser() na session yako.
   Majina ya masomo ya mwalimu lazima yafanane na "Somo" kwenye seed.
7. Kama alias ya "@/" haipo kwenye tsconfig.json, ongeza:
     "paths": { "@/*": ["./*"] }   (au ["./src/*"] ukitumia src)

KUJARIBU
--------
- /lesson-plans/admin (mkuu): "Pakia mfano wa muundo" > Seed.
- /lesson-plans (mwalimu): chagua Somo/Topic/Subtopic, darasa > Generate.
- Subtopic ya vipindi 3 = mipango 3.
- Futa data ya mfano: DELETE FROM lp_syllabi WHERE subject_name = 'MFANO';

MUUNDO WA SEED (kila mstari, tenganisha kwa |)
----------------------------------------------
Somo|Form|Source|Topic#|Topic|Subtopic#|Subtopic|Periods|MainCompetence|SpecificCompetence|MainActivity|SpecificActivity|Resources|References
(nguzo baada ya Periods ni hiari)

USALAMA
-------
- Meza zina RLS bila policy: browser haiwezi kuzisoma moja kwa moja.
- Ufikiaji wote unapita kwenye seva, na unakagua mmiliki (teacher_id) na role.
