/**
 * CSV:n jäsennys ja muodostus.
 *
 * Vienti tuottaa suomenkielisen Excelin ymmärtämää CSV:tä: erottimena
 * puolipiste, merkistönä UTF-8 ja alussa BOM, jotta ääkköset näkyvät oikein.
 * Tuonti tunnistaa erottimen (; , tai sarkain) otsikkoriviltä ja merkistön
 * (UTF-8 tai Windows-1252, jota vanha Excel tallentaa oletuksena).
 */

export type Erotin = ";" | "," | "\t";

/** Purkaa tiedoston tavut tekstiksi: UTF-8, tai Windows-1252 jos UTF-8 ei kelpaa. */
export function puraTeksti(tavut: Uint8Array): string {
  try {
    const teksti = new TextDecoder("utf-8", { fatal: true }).decode(tavut);
    return teksti.charCodeAt(0) === 0xfeff ? teksti.slice(1) : teksti;
  } catch {
    return new TextDecoder("windows-1252").decode(tavut);
  }
}

/** Arvaa erottimen ensimmäiseltä riviltä: se merkki, jota esiintyy lainausten ulkopuolella eniten. */
export function tunnistaErotin(teksti: string): Erotin {
  const maarat: Record<Erotin, number> = { ";": 0, ",": 0, "\t": 0 };
  let lainauksessa = false;
  for (const merkki of teksti) {
    if (merkki === '"') lainauksessa = !lainauksessa;
    else if (!lainauksessa && (merkki === "\n" || merkki === "\r")) break;
    else if (!lainauksessa && merkki in maarat) maarat[merkki as Erotin]++;
  }
  const [paras] = (Object.entries(maarat) as [Erotin, number][]).sort((a, b) => b[1] - a[1]);
  return paras[1] > 0 ? paras[0] : ";";
}

/**
 * Jäsentää CSV-tekstin riveiksi (RFC 4180): lainausmerkeissä olevat kentät
 * voivat sisältää erottimia, rivinvaihtoja ja tuplattuja lainausmerkkejä.
 * Tyhjät rivit palautetaan, jotta rivinumerot vastaavat tiedostoa.
 */
export function jasennaCsv(teksti: string, erotin: Erotin = tunnistaErotin(teksti)): string[][] {
  const rivit: string[][] = [];
  let rivi: string[] = [];
  let kentta = "";
  let lainauksessa = false;
  let i = 0;

  const paataRivi = () => {
    rivi.push(kentta);
    rivit.push(rivi);
    rivi = [];
    kentta = "";
  };

  while (i < teksti.length) {
    const merkki = teksti[i];
    if (lainauksessa) {
      if (merkki === '"') {
        if (teksti[i + 1] === '"') {
          kentta += '"';
          i++;
        } else {
          lainauksessa = false;
        }
      } else {
        kentta += merkki;
      }
    } else if (merkki === '"') {
      lainauksessa = true;
    } else if (merkki === erotin) {
      rivi.push(kentta);
      kentta = "";
    } else if (merkki === "\r") {
      if (teksti[i + 1] === "\n") i++;
      paataRivi();
    } else if (merkki === "\n") {
      paataRivi();
    } else {
      kentta += merkki;
    }
    i++;
  }
  if (kentta !== "" || rivi.length > 0) paataRivi();
  return rivit;
}

function lainaaTarvittaessa(arvo: string, erotin: Erotin): string {
  if (arvo.includes(erotin) || arvo.includes('"') || arvo.includes("\n") || arvo.includes("\r")) {
    return '"' + arvo.replace(/"/g, '""') + '"';
  }
  return arvo;
}

/** Muodostaa CSV-tekstin (BOM + CRLF-rivinvaihdot, kuten Excel). */
export function muodostaCsv(rivit: string[][], erotin: Erotin = ";"): string {
  return (
    "﻿" +
    rivit.map((r) => r.map((k) => lainaaTarvittaessa(k, erotin)).join(erotin)).join("\r\n") +
    "\r\n"
  );
}
