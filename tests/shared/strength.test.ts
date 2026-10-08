// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluateMaster, evaluatePassword, evaluatePhrase, evaluatePin } from '@zero/shared';

const GOOD_MASTER = 'Xk9#mQ2$vLp8!Rt4&Wy6^Zn1';
const GOOD_PHRASE = 'Na feira de hoje o cavalo branco comeu exatamente doze cenouras gigantes';

describe('evaluatePin', () => {
  it('bloqueia só o PIN degenerado', () => {
    expect(evaluatePin('12345678')).toMatchObject({ blocked: true, level: 'veryWeak' });
    expect(evaluatePin('87654321')).toMatchObject({ blocked: true });
    expect(evaluatePin('00000000')).toMatchObject({ blocked: true, reasons: ['allSame'] });
    expect(evaluatePin('12121212')).toMatchObject({ blocked: true, reasons: ['repeatedBlock'] });
  });

  it('avisa sobre data e variedade baixa sem bloquear', () => {
    const birthdate = evaluatePin('01011990');
    expect(birthdate).toMatchObject({ blocked: false, level: 'veryWeak' });
    expect(birthdate.reasons).toContain('dateLike');
    expect(birthdate.reasons).toContain('lowVariety');

    const lowVariety = evaluatePin('11223344');
    expect(lowVariety).toMatchObject({ blocked: false });
    expect(lowVariety.reasons).toContain('lowVariety');
  });

  it('PIN comum passa sem motivo e nunca passa de "razoável"', () => {
    const pin = evaluatePin('49201733');
    expect(pin).toMatchObject({ blocked: false, reasons: [] });
    expect(pin.score).toBeLessThanOrEqual(2);
    expect(evaluatePin('70391842').score).toBeLessThanOrEqual(2);
  });

  it('entrada incompleta ou com letra não bloqueia (formato é validado à parte)', () => {
    expect(evaluatePin('').blocked).toBe(false);
    expect(evaluatePin('1234').blocked).toBe(false);
    expect(evaluatePin('492017ab').blocked).toBe(false);
    expect(evaluatePin('492017ab').level).toBe('veryWeak');
  });
});

describe('evaluateMaster / evaluatePassword', () => {
  it('bloqueia repetição, bloco repetido e sequência longa', () => {
    const allSame = evaluateMaster('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(allSame).toMatchObject({ blocked: true, level: 'veryWeak' });
    expect(allSame.reasons).toContain('allSame');
    expect(evaluateMaster('abcdefghijklabcdefghijkl')).toMatchObject({ blocked: true });
    expect(evaluateMaster('123456789012345678901234')).toMatchObject({ blocked: true });
    expect(evaluateMaster('abcdefghijklmnopqrstuvwx')).toMatchObject({ blocked: true });
  });

  it('avisa sem bloquear a senha previsível mas não degenerada', () => {
    const weak = evaluateMaster('senha-mestra-guardinha24');
    expect(weak.blocked).toBe(false);
    expect(weak.reasons).toContain('commonWord');
    expect(weak.level).toBe('weak');
  });

  it('senha aleatória de 24 caracteres sai como muito forte', () => {
    const strong = evaluateMaster(GOOD_MASTER);
    expect(strong).toMatchObject({ blocked: false, level: 'veryStrong', score: 4 });
    expect(strong.reasons).toEqual([]);
  });

  it('credencial curta ou vazia não bloqueia (só informa)', () => {
    expect(evaluatePassword('')).toMatchObject({ blocked: false, level: 'veryWeak', score: 0 });
    expect(evaluatePassword('1234').blocked).toBe(false);
    expect(evaluatePassword('password').blocked).toBe(false);
    expect(evaluatePassword('password').reasons).toContain('commonWord');
  });
});

describe('evaluatePhrase', () => {
  it('bloqueia a frase cuas palavras se repetem demais', () => {
    const sameWord = evaluatePhrase('casa '.repeat(12));
    expect(sameWord).toMatchObject({ blocked: true, level: 'veryWeak' });
    expect(sameWord.reasons).toContain('fewUniqueWords');
    expect(sameWord.reasons).toContain('repeatedWords');

    const twoWords = evaluatePhrase('casa bola '.repeat(6));
    expect(twoWords.blocked).toBe(true);
    expect(twoWords.reasons).toContain('fewUniqueWords');
    expect(twoWords.reasons).toContain('repeatedWords');
  });

  it('frase com poucas palavras distintas avisa, mas passa', () => {
    const fiveUnique = evaluatePhrase(
      'casa bolo gato peixe livro casa bolo gato peixe livro casa bolo',
    );
    expect(fiveUnique.blocked).toBe(false);
    expect(fiveUnique.reasons).toContain('fewUniqueWords');
    expect(fiveUnique.reasons).toContain('repeatedWords');
  });

  it('frase bem escrita passa limpa', () => {
    const phrase = evaluatePhrase(GOOD_PHRASE);
    expect(phrase).toMatchObject({ blocked: false, level: 'veryStrong' });
    expect(phrase.reasons).toEqual([]);
  });

  it('frase incompleta não é bloqueada nem criticada', () => {
    const partial = evaluatePhrase('apenas tres palavras');
    expect(partial).toMatchObject({ blocked: false });
    expect(partial.reasons).not.toContain('fewUniqueWords');
  });
});
