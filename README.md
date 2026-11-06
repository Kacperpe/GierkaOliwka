# Gierka Oliwka 🍹

Widok 3D z perspektywy stołu.

Gra na Androida: celujesz napojem, strzelasz w górę stołu, a dwa takie same napoje łączą się w wyższy poziom.

## Zasady
- Przesuń palcem w lewo/prawo, żeby wycelować — puść, żeby strzelić.
- Dwa obiekty tego samego poziomu po zderzeniu łączą się w następny (10 poziomów).
- Punkty: połączenie dwóch obiektów poziomu *n* daje **2ⁿ pkt** (2× lv1 = 2, 2× lv2 = 4, 2× lv3 = 8 …).
- Dwa obiekty lv10 znikają za 1024 pkt.
- **Zamówienia** u góry: stworzenie zamówionego napoju daje bonus (5× wartość poziomu).
- Koniec gry, gdy po strzale jakiś obiekt zatrzyma się poniżej przerywanej linii.
- Napoje są przyciągane w stronę dalekiego końca stołu (grawitacja na północ).
- **Combo**: kolejne połączenia z jednego strzału liczą się jako Combo x2, x3…
- **Power-upy** (max 3, lewa strona ekranu) — losowy za ponad 3 połączenia w jednym strzale, 30% szans za zamówienie:
  - ⚡ **Piorun** – strzał w napój łączy wszystkie takie same w jeden poziom wyżej (w miejscu najdalszego)
  - 💣 **Bomba** – wybuch rozrzuca napoje dookoła
  - 🌈 **Joker** – łączy się z pierwszym trafionym napojem jak para
  - ⏫ **Ulepszacz** – trafiony napój +2 poziomy
  - 🧲 **Magnes** – przez 2,5 s przyciąga do siebie napoje tego samego rodzaju
  - 🧊 **Lód** – następny strzał bez tarcia, odbija się jak bila
  - 🔄 **Zamiana** – zamienia aktualny napój z „Następnym” (działa od razu)
  - 🌊 **Fala** – pcha wszystko w stronę końca stołu (działa od razu)
- Rekord i stan gry zapisują się automatycznie.

## Tryby i postęp
- **Tryby:** Klasyczny, 📅 Wyzwanie dnia (ten sam układ dla wszystkich danego dnia), ⏱ Na czas (60 s, +2 s za zamówienie), 🧘 Zen (bez przegranej), 🎯 Kod wyzwania.
- **Misje:** 3 losowe na partię (monety za każdą, bonus + power-up za wszystkie).
- **Zamówienia na czas:** pasek pod zamówieniem; zrobione w pierwszej połowie czasu = nagroda x2. Przepadłe znikają bez kary.
- **Złote napoje ✨:** ~6% strzałów, połączenie daje x3 punktów.
- **Rosnąca trudność:** im dłużej, tym wyższe poziomy na start; od 40. strzału pojawiają się kamienie 🪨 (znikają same albo od bomby).
- **Monety, poziom gracza, sklep:** stoły (drewno, marmur, cukierkowy, neon) i tła (dzień, zachód, noc, zima).
- **Kolekcja:** album napojów + sekretne niespodzianki — teksty sekretów edytujesz w `app/src/main/assets/config.js`.
- **Powroty:** seria dni 🔥 z nagrodą, prezent dnia 🎁 (losowy power-up).
- **Wyniki:** lokalna tablica top 10 dla każdego trybu, „Wyzwij kogoś” wysyła kod, który znajomy wpisuje w „Kod wyzwania”.
- **Efekty:** dźwięki (syntezowane), wibracje, wstrząsy ekranu, slow-mo przy combo x4, baner nowego napoju.

## Aktualizacje
- **Gra (HTML/JS w `app/src/main/assets/`)** — aplikacja przy każdym starcie pobiera pliki z najnowszego commita na `main`
  (lista w `assets/files.txt`). Wystarczy push — zmiana jest widoczna po ponownym uruchomieniu, bez instalowania APK.
  Offline działa ostatnia pobrana wersja (albo wbudowana w APK).
- **APK (kod Kotlin, manifest itd.)** — push poza `assets/` buduje nowy APK w Releases, a aplikacja sama proponuje aktualizację.

## Pobieranie APK
Każdy push na `main` buduje APK w GitHub Actions i publikuje go w zakładce **Releases** (`GierkaOliwka.apk`).
APK jest podpisany stałym kluczem z repo, więc nowe wersje instalują się jako aktualizacja.

## Budowa
- `app/src/main/assets/` — gra (HTML5 canvas, `game.js`)
- `app/src/main/java/.../MainActivity.kt` — pełnoekranowy WebView
- Lokalnie: `gradle assembleRelease` (Gradle 8.9, JDK 17)
