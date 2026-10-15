# Toiminnanohjaus

Sisäinen toiminnanohjausjärjestelmä (ERP) talotehtaalle, rakennettu
liitteenä olleen sivukartta-/rakennekaavion pohjalta (ks.
`docs/rakennekaavio.png` ja `docs/ARKKITEHTUURI.md`). Kuusi pääosiota:
**Asiakkuuksien hallinta**, **Projektit**, **Tuotehallinta**,
**Reklamaatiot**, **Laadunvarmistus** ja **Tuotannon ohjaus**.

Projekti on pääobjekti. Jokainen rakennus on erilainen, mutta se kootaan
rakenneosakirjastosta: projekti → rakennus → määräluettelo (rakenneosa ×
määrä) ja elementti. Rakenneosa on joko tehtaan oma rakenne
(materiaaliluettelo) tai valmiina ostettava ostonimike. Materiaaliluetteloista ja
työtuntinormeista lasketaan tarjouksen omakustannus, hankintojen
materiaalitarve ja tehtaan tuntimenekki. Määrät voi tuoda BIM-mallin
määräluettelosta.

Tämä on ensimmäinen, toimiva versio kaikista viidestä osiosta - tarkoitettu
jatkokehitettäväksi Claude Codella. Ks. lopussa oleva **Jatkokehitys**-osio
siitä, mikä on tarkoituksella jätetty auki.

## Pikakäynnistys

Vaatii Node.js 20+, PostgreSQL 16:n (Dockerilla tai paikallisena palveluna,
tunnukset erp/erp, tietokanta erp) ja npm.

```bash
npm install
npm run db:generate           # npm 11 ohittaa Prisman asennusskriptin
cp .env.example .env          # oletusarvot toimivat suoraan docker-composen kanssa
docker compose up -d          # nostaa Postgresin porttiin 5432
npm run db:migrate            # luo taulut (kysyy migraation nimen ensimmäisellä kerralla)
npm run db:seed               # täyttää esimerkkidatalla (mm. tuttu 11 rivin tuotantoaikataulu)
npm run dev                   # http://localhost:3000
```

`npm run db:studio` avaa Prisma Studion tietokannan selaamiseen ilman
käyttöliittymää.

## Rakenne

Ks. `docs/ARKKITEHTUURI.md` - siellä on täysi taulukko kaavion jokaisesta
solmusta ja sen vastaavasta reitistä/Prisma-mallista, sekä selitys
teknologiavalinnoille.

Lyhyesti:

- `src/app/**` - yksi kansio per kaavion solmu (Next.js App Router).
- `prisma/schema.prisma` - koko tietomalli, kommentoitu kaavion mukaan.
- `src/lib/production-schedule.ts` - Tuotantoaikataulun kesto/ennuste-kaavat,
  suoraan portattuna aiemmin rakennetusta Artifact-työkalusta.
- `src/lib/actions/*.ts` - Server Actions -pohjaiset CRUD-toiminnot per osio.
- `src/lib/tiedonsiirto/` - tietojen tuonti ja vienti (`/tiedonsiirto`).

## Tiedonsiirto

Sivulla `/tiedonsiirto` voi tuoda ja viedä kaikkien osioiden tietoja:

- **Vienti:** Excel, CSV tai JSON yksittäisestä kohteesta. Koko järjestelmän
  saa viedyksi Excel-työkirjana (välilehti per kohde + ohjeet) tai
  JSON-varmuuskopiona.
- **Tuonti:** Excel, CSV (; , tai sarkain, UTF-8 tai Windows-1252) tai JSON.
  Tuonti tehdään kahdessa vaiheessa. Esikatselu näyttää rivikohtaisesti,
  mitä luotaisiin, päivitettäisiin tai ohitettaisiin ja mitkä rivit ovat
  virheellisiä, eikä se muuta mitään. Tallennus käyttää samoja asetuksia.
  Olemassa olevat rivit tunnistetaan luonnollisella avaimella (esim.
  nimikekoodi, Y-tunnus tai asiakkaan nimi), joten viety tiedosto kelpaa
  sellaisenaan takaisin tuotavaksi.
- **Pohjat:** tyhjä tuontipohja kohteittain, esimerkkirivin kanssa.
- **Loki:** tallennetut tuonnit ja viennit kirjataan tauluun `DataTransferLog`.

Kohteet: asiakkaat, tarjoukset, projektit, rakennukset, määräluettelo
(BIM), elementit, tilausvahvistukset, virstanpylväät,
hankintasuunnitelmat, tuotantoaikataulu, nimikkeet, rakenneosat,
rakenneosien materiaalit, hinnastot, hinnastorivit, reklamaatiot, tarkastuslistat,
tarkastuskohdat, dopit, tuotantokansiot, työmääräimet ja piirustukset.

**BIM-määräluettelo:** vie mallista (Revit, Tekla, Archicad, Solibri)
määräluettelo Exceliin tai CSV:ksi ja tuo se kohteeseen *Määräluettelo*.
Sarakkeet tunnistetaan myös englanninkielisistä otsikoista (Type Name, Area,
Level, GlobalId). Rakenneosa tunnistetaan koodista tai rakenneosan
BIM-tyyppinimestä, ja GlobalId päivittää uusintatuonnissa saman rivin.

## Jatkokehitys (Claude Code)

**Tilanne 30.9.2026.** Tehty ensimmäisen version jälkeen:

- Alkumigraatio ja ESLint-asetukset.
- Vitest ja testit tuotantoaikataulun laskennalle ja tiedonsiirrolle (50 testiä).
- Tiedonsiirto: kaikkien osioiden tuonti ja vienti (`/tiedonsiirto`).
- Ulkoasu Wodulen brändi-ilmeen mukaiseksi (wodule.fi).

**Tilanne 1.10.2026.** Projektinhallinta projektinhallinnan Excelin pohjalta:

- Projektiaikataulu tehtäväaikatauluksi (T1, T2, …, edeltäjä, siirto, kesto, ennuste, Gantt).
- Hankintasuunnitelma kytketty aikatauluun: toimituspäivä aikataulusta, vaiheiden takarajat taaksepäin, vaiheet ja vastuuhenkilöt.
- Tehtäväluettelo henkilöittäin, henkilörekisteri (`/henkilot`) ja projektiorganisaatio.
- Projektin Excelin voi tuoda suoraan projektin sivulta.

**Tilanne 6.10.2026.** Projekti pääobjektiksi ja talotehtaan tietomalli:

- Projektit omaksi pääosiokseen (`/projektit`), vanhat osoitteet ohjataan uusiin.
- Rakennukset projektin alle, rakenneosakirjasto (rakenteet materiaaliluetteloineen ja työtuntinormeineen sekä ostonimikkeet), määräluettelot ja elementit.
- Tarjouksen sisältö (rakennukset ja määräluettelot), omakustannus ja kate. "Muuta projektiksi" siirtää rakennukset projektille.
- Materiaalitarve nimikkeittäin ja hankintarivien luonti siitä. Hinnastoille tuntihinta.
- Reklamaatiot, tarkastuslistat (pohjat), dokumentit, työmääräimet ja piirustukset kohdistettavissa rakennukseen tai elementtiin.
- BIM-valmius: määräluettelon tuonti, GUID:t rakennuksille, määräluettelon riveille ja elementeille, BIM-mallin linkki.
- Rakennekaavio päivitetty 8.10.2026 (`docs/rakennekaavio.png`, generoidaan tiedostosta `docs/rakennekaavio.mjs`).

Tehty ja pushattu (commit `a3a6905`). Testattu yksikkötesteillä (74) ja
päästä päähän erillistä kokeilukantaa vasten (lomakkeet, muunnos projektiksi,
hankinnat, BIM-tuonti, ostonimikkeet). Ei vielä kokeiltu selaimessa oikealla
datalla.

**Tilanne 8.10.2026.** Tarjouslaskenta ja litterat:

- Woodcomp Modulesin kustannusarviolaskuri tarjouslaskentatyökaluksi (`/asiakkuuksien-hallinta/tarjouslaskenta`). Laskenta on portattu sellaisenaan, ja testit vertaavat sitä alkuperäiseen laskuriin.
- Laskurin 104 laskentariviä ja 29 litteraa ovat rakenneosakirjastossa. Määrät lasketaan laskurissa, ja hinnat ovat muokattavissa kirjastossa.
- Tarjouksen ja projektin rakennuksen laskenta tallentuu määräluetteloon, joka lajitellaan litteroittain. Tarjoushinnan voi asettaa laskelmasta.
- Kiinteähintaiset rivit (ostot ja aliurakat) hankintasuunnitelmaan litteroineen ja kustannuksineen.
- Rakennekaavio päivitetty.

**Tilanne 9.10.2026.** Manuaalinen tarjouslaskenta ja laskentapohjat:

- Tarjouslaskentaan välilehdet Laskuri, Manuaalinen ja Pohjat.
- Manuaalinen laskenta: rakennuksen laskenta kootaan itse litteroittain. Rivi on kirjaston rakenneosa, nimikkeistön nimike tai vapaa rivi, ja sille voi antaa oman hinnan, litteran ja kustannuslajin. Rivin voi lisätä mihin tahansa litteraan, ja uuden litteran voi luoda samalla sivulla. Kate on rakennuskohtainen.
- Laskurin rivit voi muuttaa manuaalisiksi, ja käsin muokattu laskurin rivi säilyy laskennan uudelleentallennuksessa.
- Laskentapohjat: rakennuksen laskenta (rivit, kate, laskurin syöte) tallennetaan nimettynä pohjana ja otetaan toisen rakennuksen pohjaksi (lisää tai korvaa). Pohjat ovat myös tiedonsiirrossa.

**Tilanne 9.10.2026 (2).** Laskurin riveille materiaaliluettelot: kiinteä hinta pysyy
laskurin mukaisena, mutta materiaaliluettelo tuottaa materiaalitarpeen ja hankinnat
nimikkeittäin. Rakenneosan sivu vertaa materiaalien hinnastohintaa kiinteään hintaan.

**Tilanne 13.10.2026.** Tarjouksen PDF: Tarjoukset-listalla ja tarjouksen sivulla
on painike, joka avaa tarjouksen PDF:nä selaimeen tulostettavaksi
(`/api/tarjoukset/<id>/pdf`). Sisältö: Wodulen logo, tarjousnumero, tilaaja ja
tarjoaja, hinta alv 0 % ja verollinen, rakennukset ja rakennuskohtainen sisältö
litteroittain. "PDF ilman sisältöä" jättää sisältöerittelyn pois. Tarjoajan tiedot
annetaan `.env`:ssä (`TARJOAJA_NIMI`, `TARJOAJA_YHTEYSTIEDOT`). Asiakkaalle näkyvät
laskentarivien nimet, joten tarkista kirjastosta esimerkiksi rivit "AP Tervas Airi"
ja "Varastokulutus". Pushattu (commit `e4f90f0`).

**Tilanne 14.10.2026.** Rakenteen materiaaliluetteloon voi valita ostonimikkeen,
jolloin sen nimike tallentuu materiaaliksi. BOM pysyy tarkoituksella
kaksitasoisena (rakennus → rakenneosa → nimike); kokoonpanojen uudelleenkäyttöön
käytetään laskentapohjia. Rekursiivista rakennetta harkitaan vasta, jos tulee
vakiomoduuleja (esim. kylpyhuonemoduuli), joiden muutosten pitää päivittyä kaikkiin
rakennuksiin. Pushattu (commit `45a6a34`). Ostonimikkeen tallennusta materiaaliksi
ei ole vielä kokeiltu selaimessa.

**Tilanne 15.10.2026.** Työtä tehdään kahdella koneella. Koodi kulkee
GitHubin kautta, mutta jokaisella koneella on oma tietokanta, joten syötetty
data ei siirry gitin mukana. Datan saa siirrettyä tiedonsiirron
JSON-varmuuskopiolla (Tiedonsiirto → Vie kaikki → tuo toisella koneella).
Toisella koneella:

- Haettiin muutokset 6.–14.10., asennettiin riippuvuudet ja ajettiin 5
  migraatiota (`npx prisma migrate deploy`). 94 testiä menee läpi.
- Kohta 2 aloitettu: tarjouslaskurin 104 laskentariviä ja 29 litteraa tuotu
  kirjastoon. Täydentämistä varten tarvitaan:
  - tehtaan työtunnin hinta (hinnaston tuntihinta on tyhjä)
  - ajantasainen hintalista laskurin yksikköhinnoille
  - omat rakenteet, materiaalit ja ostonimikkeet
  - asiakkaalle sopivat nimet riveille kuten "AP Tervas Airi" ja
    "Varastokulutus".
- Testidataa siivottu: jäljellä asiakkaat Puumesta ja testi. Demoprojekti
  "testi 4321" on entinen Firstcamp iglut, jonka aikataulu ja
  hankintasuunnitelma on tuotu projektinhallinnan Excelistä.

Kahden koneen työtapa: aloita aina `git pull`, `npm install`,
`npm run db:generate` ja `npx prisma migrate deploy`. Lopeta committaamalla ja
pushaamalla.

Seuraavaksi (tauon jälkeen):

0. Aseta `.env`:iin `TARJOAJA_NIMI` ja `TARJOAJA_YHTEYSTIEDOT`, avaa jonkin
   tarjouksen PDF ja nimeä asiakkaalle sopimattomat laskentarivit kirjastossa.
   Kokeile ostonimikkeen lisäämistä rakenteen materiaaliksi.

1. Tuo tarjouslaskurin laskentarivit kirjastoon (Rakenneosat-sivun painike) ja
   täydennä omat rakenteet, materiaalit, ostonimikkeet ja hinnaston tuntihinta.
   Seedin ajaminen tyhjentäisi kannan. Tarkista laskurin yksikköhinnat
   kirjastossa (oletuksena alkuperäisen laskurin hinnat).
2. Lisää tärkeimmille laskurin riveille materiaaliluettelot (rakenneosan sivu
   tai tiedonsiirto: Rakenneosien materiaalit), jotta materiaalitarve ja
   hankinnat tulevat nimikkeittäin. Tarkista sivun vertailu materiaalien
   hinnastohinnan ja kiinteän hinnan välillä.
3. Kokeile kulku selaimessa oikealla kohteella, jonka hinnan tiedät: tarjous →
   rakennus → laskuri tai manuaalinen laskenta → pohjaksi → kate → Muuta
   projektiksi → elementit → materiaalitarve → hankintasuunnitelma. Mitään
   näkymää ei ole vielä käytetty selaimessa (testattu yksikkötesteillä ja
   HTTP-kokeiluilla). Korjaa havainnot ennen uusia ominaisuuksia.
4. Ennen oikeaa käyttöä: varmuuskopiot (`pg_dump` ajastettuna) ja
   käyttöympäristö. Ennen kuin sovellus avataan muille: kirjautuminen ja
   Next.js 15/16 (14.2:n tunnetut tietoturva-aukot).
5. BIM: suora IFC-tiedoston luku (määrät IfcElementQuantity-tiedoista) tai
   mallipalvelun rajapinta (Trimble Connect, Dalux), jotta määräluettelon
   vientiä ei tarvita.

Aiemmin: kokeile uusia projektisivuja selaimessa oikealla projektilla
(tehtävien jako henkilöille, vaiheiden siirto, Excel-tuonti) ja korjaa
havainnot ennen uusia ominaisuuksia.

Avoin kysymys (2.10.2026): kun projektin Excel tuodaan uudelleen samaan
projektiin, Excelin x-merkinnät (tarjous kysytty, sopimus valmis) asettavat
hankintojen vaiheet Excelin mukaisiksi. Järjestelmässä eteenpäin siirretyt
vaiheet voivat siis palata taaksepäin. Vaihtoehto on muuttaa tuontia niin,
ettei se koskaan siirrä vaihetta taaksepäin. Päätös on vielä tekemättä.

Kaikki osiot ovat käytettävissä (lisäys ja listaus tietokannasta), mutta
moni yksityiskohta on vielä auki. Ehdotettu järjestys:

1. **Kirjautuminen ja käyttöoikeudet.** `User`-malli ja `UserRole`-enum ovat
   skeemassa valmiina, mutta eivät kytkettynä mihinkään. Lisää esim.
   NextAuth/Auth.js, ja rajaa esim. `Laadunvarmistus`/`Tuotannon ohjaus`
   -kirjoitukset roolin mukaan.
2. **Tiedostojen tallennus.** `Dopit`, `Piirustukset` ja tarjousten liitteet
   käyttävät tällä hetkellä pelkkää `fileUrl`-tekstikenttää. Korvaa oikealla
   tiedostotallennuksella (S3-yhteensopiva, esim. Cloudflare R2 tai
   Supabase Storage).
3. **Sharepoint-integraatio.** `ProductionFolder.sharepointUrl` on tällä
   hetkellä pelkkä linkki. Oikea toteutus vaatisi Microsoft Graph -integraation
   kansion sisällön (tiedostolistan) hakemiseksi suoraan tähän näkymään.
4. **Tuotantoaikataulun Gantt-visualisointi.** Nykyinen Gantt
   (`TuotantoaikatauluClient.tsx`) on tarkoituksella yksinkertaistettu versio
   alkuperäisestä Artifact-työkalusta (ei kuukausi/viikko-otsikoita, ei
   mukautettua hover-tooltipiä - pelkkä `title`-attribuutti). Jos rikkaampi
   aikajana halutaan takaisin, se voi ottaa suoraan mallia alkuperäisestä
   Artifact-sivusta.
5. **Testit.** Vitest on käytössä (`npm test`). Testattuja ovat
   `src/lib/production-schedule.ts`, rakenteiden laskenta (`src/lib/rakenteet.ts`) ja tiedonsiirron puhdas logiikka.
   Seuraavaksi kannattaa testata Server Actionsien ja rajapintareittien
   validointi sekä tiedonsiirron tuonti tietokantaa vasten.
6. **Muokkaus ja poisto.** Projektiaikataulussa, hankintasuunnitelmassa,
   tehtäväluettelossa ja henkilöissä voi muokata ja poistaa. Muilla sivuilla
   voi vielä vain lisätä ja listata. Niillä muokkaus onnistuu tiedonsiirron
   kautta (vie, muokkaa, tuo).
7. **Validointi API-rajapinnoissa.** `src/lib/validation.ts` kattaa
   Tuotantoaikataulu-rajapinnan; muut Server Actions käyttävät kevyempää
   inline-zod-validointia - yhtenäistä tyyliä jos halutaan.

## Tekninen tausta: kaksi eri "aikataulua"

Kaaviossa esiintyy kaksi eri aikataulukäsitettä - älä sekoita niitä
jatkokehityksessä:

- **Tuotantoaikataulu projektit** (`ProductionScheduleItem`) - tarkka
  tuotannon Gantt, ketjutettu `seq`-järjestyksessä, jossa jokaisen rivin
  aloitus lasketaan edellisen rivin ennusteesta + `siirto`. **"Kesto" on ainoa
  aikataulua ohjaava kenttä** - "Laskennallinen kesto" on pelkkä vertailuluku
  eikä saa koskaan syöttää arvoa "Kesto"-kenttään.
- **Projektiaikataulu** (`ScheduleTask` + virstanpylväät `ProjectMilestone`) -
  yksittäisen projektin tehtäväaikataulu, jossa tehtävät viittaavat
  edeltäjiinsä tunnuksella. Ei kytköksissä yllä olevaan. Hankintasuunnitelman
  takarajat lasketaan tästä aikataulusta.
