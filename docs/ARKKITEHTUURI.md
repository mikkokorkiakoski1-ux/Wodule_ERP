# Arkkitehtuuri

Tämä sovellus on toteutettu suoraan liitteenä olleen sivukartta-/rakennekaavion
(`docs/rakennekaavio.jpg`) mukaan. Kaavio on ainoa lähde sille, mitä osioita ja
alasivuja järjestelmässä on - jos rakenne muuttuu, päivitä ensin kaavio, sitten
tämä taulukko ja `src/components/SectionNav.tsx`.

## Teknologiavalinnat

- **Next.js 14 (App Router) + TypeScript** - yksi koodikanta UI:lle ja API:lle.
- **PostgreSQL + Prisma** - tietomalli `prisma/schema.prisma`, ajetaan Dockerilla
  (`docker-compose.yml`) tai paikallisena palveluna (ks. CLAUDE.md).
- **Tailwind CSS** + Wodulen brändi-ilme (wodule.fi): tumma vihreä, oranssi
  korostusväri, vaalea ruskea tausta, Chakra Petch- ja Reddit Sans -fontit sekä
  viistetyt kulmat. Värit ovat CSS-muuttujina `globals.css`:ssä (vaalea ja
  tumma teema), ja yhteiset luokat `.btn`, `.btn-primary`, `.btn-secondary`,
  `.btn-ghost`, `.field`, `.card` ja `.badge` ovat samassa tiedostossa. Käytä
  niitä uusilla sivuilla. Logo on komponentissa `WoduleLogo.tsx`.
- **Server Actions** useimpiin CRUD-lomakkeisiin (yksinkertaisin tapa Next.js
  App Routerissa). **Tuotantoaikataulu projektit** -osio on poikkeus: se on
  client-komponentti, joka kutsuu omia REST-reittejään
  (`src/app/api/tuotantoaikataulu/**`), koska se tarvitsee saman interaktiivisen
  taulukko/Gantt-käyttökokemuksen kuin alkuperäinen Artifact-työkalu (lisäys,
  muokkaus, järjestyksen vaihto ilman koko sivun uudelleenlatausta).
- **Ei vielä kirjautumista.** `User`-malli on olemassa skeemassa, mutta mitään
  ei ole vielä kytketty siihen. Tämä on tarkoituksella jätetty Claude Coden
  jatkokehitykseen (ks. juuren `README.md` roadmap-osio).

## Talotehtaan tietomalli: projekti pääobjektina

Jokainen rakennus on erilainen, mutta rakenteet ja materiaalit on vakioitu.
Siksi järjestelmässä on kaksi rinnakkaista runkoa:

```
Rakenneosakirjasto (Tuotehallinta)      Projekti (pääobjekti, /projektit)
Rakenneosa (StructureType)           <-+  Project -- Customer, Offer
  StructureMaterial: Product x menekki |    Building 1..n (rakennus)
  laborHoursPerUnit (työtuntinormi)    +--    Määräluettelo (BuildingPart): rakenneosa x määrä (käsin tai BIM)
  bimTypeName (BIM-tyyppinimi)                ProductionElement: elementti / tilaelementti
Product + PriceList (hinnat, tuntihinta)        -> WorkOrder, Drawing, QaChecklist, Complaint
```

Rakenneosa on joko **rakenne** (oma valmistus, esim. US-1 ulkoseinä: materiaaliluettelo ja
työtuntinormi) tai **ostonimike** (valmiina ostettava osa, esim. ilmalämpöpumppu: yksi
nimike × 1, työtunnit = asennus). Käyttöliittymän termit: *rakenneosa* = `StructureType`,
*määräluettelon rivi* = `BuildingPart`.

Määräluetteloista lasketaan (`src/lib/rakenteet.ts`, testit `rakenteet.test.ts`):

- **materiaalitarve** nimikkeittäin: määrä x menekki x (1 + hukka-%)
- **tuntimenekki**: määrä x työtuntinormi. Vain vertailuluku, ei kirjoitu
  tuotantoaikataulun kenttiin.
- **omakustannus**: materiaalit uusimman voimassa olevan hinnaston hinnoilla
  + tunnit x hinnaston tuntihinta. Hinnattomat nimikkeet näytetään varoituksena.

Kulku: tarjoukselle annetaan rakennukset ja niiden määräluettelot (`Building.offerId`),
ja sivu näyttää omakustannuksen ja katteen. **Muuta projektiksi** luo projektin
ja liittää samat rakennukset siihen (`Building.projectId`; `offerId` jää
historiaksi). Projektin Materiaalitarve-välilehti luo tai päivittää
hankintasuunnitelman materiaalirivit (`ProcurementItem.productId`); jo
luoduilla riveillä päivittyy vain määrä, ja vaihe sekä toimittaja säilyvät.

**BIM.** Rakennuksella on linkki malliin (`bimModelUrl`) ja IfcBuildingin
GUID. Määräluettelo-tiedonsiirtokohde (`maaraluettelo`) ottaa vastaan mallin määräluettelon
(Excel/CSV): rakenneosa tunnistetaan koodista tai `StructureType.bimTypeName`ista,
ja `BuildingPart.bimGuid` päivittää uusintatuonnissa saman rivin
(`source = BIM`). Puuttuva rakennus luodaan projektiin. Elementeillä on oma
`bimGuid`. Suora IFC-luku tai mallipalvelun rajapinta on jatkokehitystä.

## Kaavio -> toteutus -vastaavuustaulukko

Projektit nostettiin Asiakkuuksien hallinnan alta omaksi pääosiokseen
(`/projektit`). Vanhat `/asiakkuuksien-hallinta/projektit/**`-osoitteet
ohjataan uusiin (`next.config.mjs`). **`docs/rakennekaavio.jpg` pitää
päivittää käsin vastaamaan tätä taulukkoa.**

| Kaavion solmu | Reitti | Prisma-malli(t) |
|---|---|---|
| Pääikkuna | `/` | (koosteen laskee useasta mallista) |
| Asiakkuuksien hallinta | `/asiakkuuksien-hallinta` | `Customer` |
| └─ Tarjoukset | `/asiakkuuksien-hallinta/tarjoukset`, `/[id]` (sisältö, kate, Muuta projektiksi) | `Offer`, `Building` (offerId) |
| Projektit | `/projektit` | `Project` |
| ├─ Tuotantoaikataulu projektit | `/projektit/tuotantoaikataulu` | `ProductionScheduleItem` |
| └─ Projekti 1, Projekti 2, ... | `/projektit/[id]` | `Project` (yksi rivi per projekti) |
| &nbsp;&nbsp;&nbsp;├─ Yhteenvetosivu (+ Tilausvahvistus) | `/projektit/[id]` | koostesivu, `OrderConfirmation`, `ProjectMember` |
| &nbsp;&nbsp;&nbsp;├─ *Rakennukset (ei kaaviossa)* | `/projektit/[id]/rakennukset`, `/[rakennusId]` | `Building`, `BuildingPart`, `ProductionElement` |
| &nbsp;&nbsp;&nbsp;├─ Projektiaikataulu | `/projektit/[id]/aikataulu` | `ScheduleTask`, `ProjectMilestone` |
| &nbsp;&nbsp;&nbsp;├─ Hankintasuunnitelma | `/projektit/[id]/hankintasuunnitelma` | `ProcurementPlan`, `ProcurementItem` |
| &nbsp;&nbsp;&nbsp;├─ *Materiaalitarve (ei kaaviossa)* | `/projektit/[id]/materiaalitarve` | laskettu `BuildingPart`ista |
| &nbsp;&nbsp;&nbsp;└─ *Tehtäväluettelo (ei kaaviossa)* | `/projektit/[id]/tehtavat` | `ProjectTodo` + `ProcurementItem` |
| Tuotehallinta | `/tuotehallinta` | - |
| ├─ Nimikkeistö (Tuote1, Tuote2, ...) | `/tuotehallinta/nimikkeisto` | `Product` |
| ├─ *Rakenneosat (ei kaaviossa)* | `/tuotehallinta/rakenneosat`, `/[id]` (vanha `/rakennetyypit` ohjataan) | `StructureType` (rakenne tai ostonimike), `StructureMaterial` |
| └─ Hinnastot | `/tuotehallinta/hinnastot` | `PriceList` (+ tuntihinta), `PriceListItem` |
| Reklamaatiot | `/reklamaatiot` | `Complaint` (kohdistus projekti/rakennus/elementti) |
| Laadunvarmistus | `/laadunvarmistus` | - |
| ├─ Tarkastuslistat | `/laadunvarmistus/tarkastuslistat` | `QaChecklist` (pohja tai rakennuksen/elementin tarkastus), `QaChecklistItem` |
| └─ Dopit | `/laadunvarmistus/dopit` | `QaDocument` (valinnainen rakennus) |
| Tuotannon ohjaus | `/tuotannon-ohjaus` | - |
| └─ Sharepoint tuotantokansio (per projekti) | `/tuotannon-ohjaus/[id]` | `ProductionFolder` |
| &nbsp;&nbsp;&nbsp;├─ Työmääräimet | `/tuotannon-ohjaus/[id]/tyomaaraimet` | `WorkOrder` (valinnainen rakennus/elementti) |
| &nbsp;&nbsp;&nbsp;└─ Piirustukset | `/tuotannon-ohjaus/[id]/piirustukset` | `Drawing` (valinnainen rakennus/elementti) |

**Kaavion ulkopuoliset työkalut** (navigaatiossa omana Järjestelmä-ryhmänään):

| Työkalu | Reitti | Prisma-malli(t) |
|---|---|---|
| Henkilöt (henkilörekisteri) | `/henkilot`, `/henkilot/[id]` (henkilön tehtävät kaikista projekteista) | `User` |
| Tiedonsiirto (tuonti ja vienti) | `/tiedonsiirto`, `/api/tiedonsiirto/{vienti,pohja,tuonti}` | kaikki yllä olevat + `DataTransferLog` |

Projektin alasivuilla on yhteinen layout (`projektit/[projektiId]/layout.tsx`):
otsikko ja välilehdet Yhteenveto, Rakennukset, Projektiaikataulu,
Hankintasuunnitelma, Materiaalitarve ja Tehtäväluettelo. Kursivoidut rivit
eivät ole kaavion solmuja. Jos ne halutaan kaavioon, `docs/rakennekaavio.jpg`
pitää päivittää käsin.

Tiedonsiirto tuo ja vie kaikkien viiden osion tietoja (CSV, Excel, JSON).
Jokainen tuotava tietotyyppi on "kohde" tiedostossa
`src/lib/tiedonsiirto/kohteet.ts`: sarakkeet, vienti ja yhden rivin tuonti.
Uuden mallin saa tuonnin ja viennin piiriin lisäämällä sille kohteen.
Viittaukset kulkevat luettavilla avaimilla (asiakkaan nimi tai Y-tunnus,
nimikekoodi, projektin nimi), eivät tietokantatunnisteilla. Tuonti ajetaan
yhdessä transaktiossa, ja jokainen rivi on oma savepointinsa. Esikatselu
ajaa saman tuonnin ja perii sen lopuksi.

**Huomio kaavion kahdesta aikataulusta**, koska ne on helppo sekoittaa:

- **Tuotantoaikataulu projektit** (Projektit-osion alla) on
  koko tuotannon läpimenoa ohjaava, tarkka viikko/päivätason Gantt-aikataulu.
  Tämä on suoraan portattu aiemmasta Artifact-työkalusta
  (`src/lib/production-schedule.ts`) - kesto/ennuste-kaavat ja
  "Laskennallinen kesto" -tukikenttä ovat identtiset.
- **Projektiaikataulu** (yksittäisen projektin alla) on projektin oma
  tehtäväaikataulu (`ScheduleTask`), joka vastaa projektinhallinnan Excelin
  aikataulu-välilehteä: tehtävällä on tunnus (T1, T2, ...) ja edeltäjä
  tunnuksena, ja kaavat ovat samat kuin tuotantoaikataulussa
  (`src/lib/projektiaikataulu.ts` käyttää production-schedule.ts:n funktioita
  muuttamatta niitä). Samalla sivulla ovat asiakkaalle näkyvät virstanpylväät
  (`ProjectMilestone`). Projektiaikataulu ei ole kytköksissä tuotannon
  Ganttiin.

**Hankintasuunnitelma ja aikataulu on kytketty:** hankintarivi
(`ProcurementItem.scheduleTaskCode`) viittaa aikataulutehtävään, jonka
aloitus on toimituspäivä. Siitä lasketaan taaksepäin vaiheiden takarajat
(`src/lib/hankinta.ts`: sopimus = toimitus - toimitusaika, vertailu = sopimus
- neuvottelut, tarjous = vertailu - vertailuaika, pyyntö = tarjous -
pyyntöaika, aineisto = pyyntö - keräys). Rivi etenee vaiheittain (Aineisto ->
Pyyntö -> Tarjous -> Vertailu -> Sopimus -> Toimitus -> Valmis), ja
tehtäväluettelo näyttää nykyisen vaiheen takarajan vastuuhenkilöittäin.

## Kansiorakenne

```
src/
  app/                      # Next.js App Router -reitit (yksi kansio per kaavion solmu)
  lib/
    prisma.ts               # Prisma-clientin singleton
    production-schedule.ts  # Tuotantoaikataulun laskentalogiikka (portattu Artifactista)
    projektiaikataulu.ts    # Projektiaikataulun laskenta (edeltäjät tunnuksina)
    hankinta.ts             # Hankintojen vaiheet ja takarajat
    projektinhallinta.ts    # Aikataulun, hankintojen ja tehtäväluettelon tiedonhaku
    rakenteet.ts            # Rakenteiden laskenta: materiaalitarve, tunnit, omakustannus (puhdas)
    rakennukset.ts          # Rakennusten ja hinnaston tietokantahaut laskentaa varten
    lomake.ts               # Server Actionien lomakeapurit (kentat, jasenna, palaa)
    validation.ts           # Zod-skeemat API-reiteille
    actions/                # Server Actions per osio (asiakkuudet, tuotehallinta, ...)
    tiedonsiirto/           # Tuonti ja vienti: kohteet, tiedostomuodot, tuontimoottori
  components/
    SectionNav.tsx           # Sivunavigaatio - peilaa kaaviota
    TuotantoaikatauluClient.tsx  # Tuotantoaikataulun interaktiivinen taulukko/Gantt
    TiedonsiirtoTuontiClient.tsx # Tuonnin esikatselu ja tallennus
    ProjektinValilehdet.tsx  # Projektin alasivujen välilehdet
    Tehtavalista.tsx         # Tehtäväluettelon taulukko (projekti ja henkilö)
    projektinhallinta.tsx    # Projektisivujen yhteiset palat (takaraja, virhe, Excel-tuonti)
    rakennukset.tsx          # Rakennuslomake, määräluettelo, kustannuserittely, materiaalitarve
    KohdeValinta.tsx         # Projekti/rakennus/elementti-valinta kohdistuksiin
prisma/
  schema.prisma
  seed.ts                   # Siemendata, mm. sama 11 riviä kuin Artifact-työkalussa
docs/
  rakennekaavio.jpg         # Alkuperäinen liitteenä ollut kaavio
  ARKKITEHTUURI.md          # Tämä tiedosto
```
