import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from '@zero/renderer/components/Settings';
import { UNLOCKED, installApi } from '../mocks/api.ts';
import type { PanicStatus } from '@zero/types';

function installPanic(panic: PanicStatus): void {
  installApi({ status: UNLOCKED, panic });
}

describe('Configurações: PIN de pânico', () => {
  it('não mostra o formulário quando já existe um PIN de coação', async () => {
    installPanic({ hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 });

    render(<Settings />);

    expect(await screen.findByText(/PIN de coação ativo/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/PIN de coação/i)).not.toBeInTheDocument();
  });

  it('oferece remover o PIN de coação e passa pelo canal', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: true, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const clear = vi.fn(() => Promise.resolve(UNLOCKED));
    api.vault.clearPanicPin = clear;

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Remover PIN de coação/i }));

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('exige confirmação do PIN antes de enviar', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setPanic = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setPanicPin = setPanic;

    render(<Settings />);
    const field = await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i);
    await user.type(field, '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910457');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    expect(await screen.findByText(/Os PINs não coincidem/i)).toBeInTheDocument();
    expect(setPanic).not.toHaveBeenCalled();
  });

  it('envia o PIN de coação pelo canal quando os dois batem', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setPanic = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setPanicPin = setPanic;
    // o main passa a reportar o PIN instalado depois do envio
    let installed = false;
    const panicStatus = vi.fn(() =>
      Promise.resolve({ hasPanicPin: installed, nukeLimit: 0, attemptsMaster: 0 }),
    );
    api.vault.panicStatus = panicStatus;
    setPanic.mockImplementation(() => {
      installed = true;
      return Promise.resolve({ ok: true, status: UNLOCKED });
    });

    render(<Settings />);
    await user.type(await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i), '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910456');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    expect(setPanic).toHaveBeenCalledWith({ pin: '73910456' });
    expect(await screen.findByText(/PIN de coação ativo/i)).toBeInTheDocument();
    expect(panicStatus).toHaveBeenCalled();
  });

  it('mostra o erro devolvido pelo main sem trocar a tela', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    api.vault.setPanicPin = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: 'O PIN de coação não pode ser igual ao PIN que abre o cofre.',
        status: UNLOCKED,
      }),
    );

    render(<Settings />);
    await user.type(await screen.findByLabelText(/PIN de coação \(8 dígitos\)/i), '73910456');
    await user.type(screen.getByLabelText(/Repita o PIN de coação/i), '73910456');
    await user.click(screen.getByRole('button', { name: /Definir PIN de coação/i }));

    expect(
      await screen.findByText(/não pode ser igual ao PIN que abre o cofre/i),
    ).toBeInTheDocument();
  });
});

describe('Configurações: autodestruição por tentativas', () => {
  it('começa desligada e avisa antes de confirmar', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setNuke = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setNukeLimit = setNuke;

    render(<Settings />);
    expect(await screen.findByText(/^Desligada$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ativar autodestruição/i }));
    expect(await screen.findByText(/não há como desfazer/i)).toBeInTheDocument();
    // a confirmação ainda não dispara nada
    expect(setNuke).not.toHaveBeenCalled();
  });

  it('envia o limite confirmado pelo usuário', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    const setNuke = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setNukeLimit = setNuke;
    const panicStatus = vi.fn(() =>
      Promise.resolve({ hasPanicPin: false, nukeLimit: 60, attemptsMaster: 0 }),
    );
    api.vault.panicStatus = panicStatus;

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Ativar autodestruição/i }));
    await user.type(screen.getByRole('textbox', { name: '' }), '60');
    await user.click(screen.getByRole('button', { name: /Ativar autodestruição/i }));

    expect(setNuke).toHaveBeenCalledWith(60);
    expect(await screen.findByText(/60 tentativas/i)).toBeInTheDocument();
  });

  it('recusa limite abaixo do piso, com o erro do main', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 0, attemptsMaster: 0 });
    const api = window.api;
    api.vault.setNukeLimit = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: 'O limite é baixo demais para não confundir com erro de digitação.',
        status: UNLOCKED,
      }),
    );

    render(<Settings />);
    await user.click(await screen.findByRole('button', { name: /Ativar autodestruição/i }));
    await user.type(screen.getByRole('textbox', { name: '' }), '5');
    await user.click(screen.getByRole('button', { name: /Ativar autodestruição/i }));

    expect(await screen.findByText(/baixo demais/i)).toBeInTheDocument();
  });

  it('permite desligar quando está ligado', async () => {
    const user = userEvent.setup();
    installPanic({ hasPanicPin: false, nukeLimit: 60, attemptsMaster: 12 });
    const api = window.api;
    const setNuke = vi.fn(() => Promise.resolve({ ok: true, status: UNLOCKED }));
    api.vault.setNukeLimit = setNuke;

    render(<Settings />);
    expect(await screen.findByText(/60 tentativas/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Desativar autodestruição/i }));

    expect(setNuke).toHaveBeenCalledWith(0);
  });
});
