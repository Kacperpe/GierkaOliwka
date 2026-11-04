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
- Rekord i stan gry zapisują się automatycznie.

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
