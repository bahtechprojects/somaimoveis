// ==================================================
// Utilitario de dias uteis (Brasil)
// Considera sabados, domingos e feriados nacionais
// ==================================================

/**
 * Retorna feriados nacionais fixos + moveis para um ano.
 * Feriados moveis (Carnaval, Sexta-feira Santa, Corpus Christi)
 * sao calculados a partir da Pascoa (algoritmo de Gauss).
 */
function getHolidays(year: number): Set<string> {
  const holidays = new Set<string>();

  // Feriados fixos nacionais
  const fixed = [
    [1, 1],   // Confraternizacao Universal
    [4, 21],  // Tiradentes
    [5, 1],   // Dia do Trabalho
    [9, 7],   // Independencia
    [10, 12], // Nossa Senhora Aparecida
    [11, 2],  // Finados
    [11, 15], // Proclamacao da Republica
    [12, 25], // Natal
  ];

  for (const [month, day] of fixed) {
    holidays.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  // Pascoa (algoritmo de Gauss/Meeus)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const easter = new Date(year, month - 1, day);

  // Feriados moveis baseados na Pascoa
  const movable = [
    -47, // Carnaval (segunda)
    -46, // Carnaval (terca)
    -2,  // Sexta-feira Santa
    60,  // Corpus Christi
  ];

  for (const offset of movable) {
    const d = new Date(easter);
    d.setDate(d.getDate() + offset);
    holidays.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }

  return holidays;
}

// Cache de feriados por ano
const holidayCache = new Map<number, Set<string>>();

function getHolidaySet(year: number): Set<string> {
  if (!holidayCache.has(year)) {
    holidayCache.set(year, getHolidays(year));
  }
  return holidayCache.get(year)!;
}

/**
 * Verifica se uma data eh dia util (segunda a sexta, sem feriado)
 */
export function isBusinessDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false; // Domingo ou Sabado

  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return !getHolidaySet(date.getFullYear()).has(key);
}

/**
 * Retorna o proximo dia util a partir de uma data.
 * Se a data ja for dia util, retorna ela mesma.
 */
export function nextBusinessDay(date: Date): Date {
  const result = new Date(date);
  while (!isBusinessDay(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/**
 * Verifica se hoje eh dia util. Se nao for, retorna false
 * (usado para decidir se o cron deve rodar)
 */
export function isTodayBusinessDay(): boolean {
  return isBusinessDay(new Date());
}
