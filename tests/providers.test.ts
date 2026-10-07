import { describe, expect, it } from 'vitest';
import { parseFrance } from '../server/providers/france.ts';
import { parseItaly } from '../server/providers/italy.ts';
import { parseSpain } from '../server/providers/spain.ts';

describe('France parser', () => {
  const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><pdv_liste>
  <pdv id="26200001" latitude="4455800" longitude="475000" cp="26200" pop="R"><adresse>12 AVENUE JEAN JAURES</adresse><ville>MONTELIMAR</ville>
    <prix nom="Gazole" id="1" maj="2026-10-07 08:00:00" valeur="2.239"/><prix nom="E10" id="5" maj="2020-01-01 08:00:00" valeur="1.5"/></pdv>
  <pdv id="26200002" latitude="4456000" longitude="475500" cp="26200" pop="A"><ville>MONTELIMAR</ville>
    <prix nom="Gazole" id="1" maj="2026-10-07 09:00:00" valeur="2.459"/></pdv></pdv_liste>`;
  const snap = parseFrance(xml, Date.parse('2026-10-07T12:00:00Z'));

  it('reads coordinates, prices and motorway flag', () => {
    expect(snap.stations).toHaveLength(2);
    const [a, b] = snap.stations;
    expect(a!.lat).toBeCloseTo(44.558, 3);
    expect(a!.prices.diesel).toBe(2.239);
    expect(a!.city).toBe('Montelimar');
    expect(b!.motorway).toBe(true);
  });
  it('drops stale prices and averages the rest', () => {
    expect(snap.stations[0]!.prices.e10).toBeUndefined();
    expect(snap.averages.diesel).toBeCloseTo(2.349, 3);
  });
});

describe('Spain parser', () => {
  it('handles comma decimals and brand names', () => {
    const snap = parseSpain({
      Fecha: '07/10/2026 12:32:36',
      ListaEESSPrecio: [{ IDEESS: '1', 'Latitud': '42,414800', 'Longitud (WGS84)': '2,875200', 'Rótulo': 'REPSOL', 'Municipio': 'La Jonquera', 'Precio Gasoleo A': '1,799', 'Precio Gasolina 95 E5': '' }],
    });
    expect(snap.stations[0]!.name).toBe('Repsol');
    expect(snap.stations[0]!.prices).toEqual({ diesel: 1.799 });
    expect(snap.updatedAt.startsWith('2026-10-07')).toBe(true);
  });
});

describe('Italy parser', () => {
  it('joins prices to the register and prefers self-service', () => {
    const prices = 'Estrazione del 2026-10-06\nidImpianto|descCarburante|prezzo|isSelf|dtComu\n7|Gasolio|1.999|0|x\n7|Gasolio|1.789|1|x\n';
    const reg = 'Estrazione del 2026-10-06\nidImpianto|Gestore|Bandiera|Tipo Impianto|Nome Impianto|Indirizzo|Comune|Provincia|Latitudine|Longitudine\n7|X|Agip Eni|Autostradale|N|VIA ROMA 1|TORINO|TO|45.07|7.68\n';
    const snap = parseItaly(prices, reg);
    expect(snap.stations[0]!.prices.diesel).toBe(1.789);
    expect(snap.stations[0]!.motorway).toBe(true);
    expect(snap.stations[0]!.name).toBe('Agip Eni');
  });
});
