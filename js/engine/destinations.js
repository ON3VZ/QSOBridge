// engine/destinations.js — Upload-wizard (Fase 6). Kies bestemming -> juiste flavor.
// Elke bestemming mapt naar een outputformaat + (optioneel) profiel + korte instructie.

export const DESTINATIONS = [
  {
    id: 'lotw', label: { nl: 'ARRL LoTW', fr: 'ARRL LoTW', en: 'ARRL LoTW' },
    formatId: 'adif', profileId: 'lotw',
    note: {
      nl: 'Levert een conforme ADIF met MY_*-velden. Onderteken daarna met TQSL (.tq8) — die stap valt buiten deze tool.',
      fr: "Produit un ADIF conforme avec champs MY_*. Signez ensuite avec TQSL (.tq8).",
      en: 'Produces a conformant ADIF with MY_* fields. Sign afterwards with TQSL (.tq8) — outside this tool.'
    }
  },
  {
    id: 'eqsl', label: { nl: 'eQSL', fr: 'eQSL', en: 'eQSL' }, formatId: 'adif', profileId: null,
    note: { nl: 'Platte ADIF-upload. Geen ondertekening nodig.', fr: 'Upload ADIF simple.', en: 'Plain ADIF upload. No signing needed.' }
  },
  {
    id: 'qrz', label: { nl: 'QRZ.com Logbook', fr: 'QRZ.com Logbook', en: 'QRZ.com Logbook' }, formatId: 'adif', profileId: null,
    note: { nl: 'Platte ADIF-upload naar je QRZ-logboek.', fr: 'Upload ADIF vers votre journal QRZ.', en: 'Plain ADIF upload to your QRZ logbook.' }
  },
  {
    id: 'clublog', label: { nl: 'Club Log', fr: 'Club Log', en: 'Club Log' }, formatId: 'adif', profileId: null,
    note: { nl: 'Platte ADIF-upload.', fr: 'Upload ADIF simple.', en: 'Plain ADIF upload.' }
  },
  {
    id: 'pota', label: { nl: 'POTA', fr: 'POTA', en: 'POTA' }, formatId: 'adif', profileId: 'pota',
    note: { nl: 'ADIF met verplichte bestandsnaam call@park-YYYYMMDD.adi.', fr: 'ADIF, nom de fichier obligatoire.', en: 'ADIF with mandatory filename call@park-YYYYMMDD.adi.' }
  },
  {
    id: 'wwff', label: { nl: 'WWFF', fr: 'WWFF', en: 'WWFF' }, formatId: 'adif', profileId: 'wwff',
    note: { nl: 'ADIF naar de nationale logmanager. Spatie vóór de datum in de naam.', fr: 'ADIF vers le gestionnaire national.', en: 'ADIF to the national log manager.' }
  },
  {
    id: 'sota', label: { nl: 'SOTA', fr: 'SOTA', en: 'SOTA' }, formatId: 'sota', profileId: 'sota',
    note: { nl: 'CSV V2, één bestand per summit.', fr: 'CSV V2, un fichier par sommet.', en: 'CSV V2, one file per summit.' }
  },
  {
    id: 'contest-cabrillo', label: { nl: 'Contest (Cabrillo)', fr: 'Concours (Cabrillo)', en: 'Contest (Cabrillo)' }, formatId: 'cabrillo', profileId: null,
    note: { nl: 'Cabrillo voor de contest-robot. Kies het contestprofiel voor de juiste exchange.', fr: 'Cabrillo pour le robot du concours.', en: 'Cabrillo for the contest robot. Pick the contest profile for the right exchange.' }
  },
  {
    id: 'contest-edi', label: { nl: 'VHF-contest (EDI)', fr: 'Concours VHF (EDI)', en: 'VHF contest (EDI)' }, formatId: 'edi', profileId: 'iaru-r1-vhf',
    note: { nl: 'EDI/REG1TEST voor VHF/UHF-contesten (IARU R1).', fr: 'EDI/REG1TEST pour concours VHF.', en: 'EDI/REG1TEST for VHF/UHF contests (IARU R1).' }
  },
  {
    id: 'hrdlog', label: { nl: 'HRDLog', fr: 'HRDLog', en: 'HRDLog' }, formatId: 'adif', profileId: null,
    note: { nl: 'Platte ADIF-upload.', fr: 'Upload ADIF simple.', en: 'Plain ADIF upload.' }
  },
  {
    id: 'gma', label: { nl: 'GMA', fr: 'GMA', en: 'GMA' }, formatId: 'adif', profileId: 'gma',
    note: { nl: 'ADIF met GMA-referentie (bergen/activiteit).', fr: 'ADIF avec réf GMA.', en: 'ADIF with GMA reference.' }
  },
  {
    id: 'adx', label: { nl: 'ADX (ADIF-XML)', fr: 'ADX (ADIF-XML)', en: 'ADX (ADIF-XML)' }, formatId: 'adx', profileId: null,
    note: { nl: 'ADIF in XML-vorm. Zelfde velden als ADIF.', fr: 'ADIF en XML.', en: 'ADIF in XML form.' }
  },
  {
    id: 'backup', label: { nl: 'Backup (JSON)', fr: 'Sauvegarde (JSON)', en: 'Backup (JSON)' }, formatId: 'json', profileId: null,
    note: { nl: 'Volledige canonieke backup, later opnieuw in te lezen.', fr: 'Sauvegarde canonique complète.', en: 'Full canonical backup, re-importable later.' }
  }
];

export function getDestination(id) { return DESTINATIONS.find((d) => d.id === id) || null; }

/**
 * Lost een bestemming op tegen de huidige editor-status.
 * Als de bestemming geen vast profiel heeft, behoudt ze het gekozen profiel (bv. contest).
 * @returns {{formatId, profileId, note}} of null
 */
export function resolveDestination(id, currentProfileId, lang = 'nl') {
  const d = getDestination(id);
  if (!d) return null;
  return {
    formatId: d.formatId,
    profileId: d.profileId != null ? d.profileId : currentProfileId,
    note: (d.note && (d.note[lang] || d.note.en)) || ''
  };
}
