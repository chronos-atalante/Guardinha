import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App from '@zero/renderer/App';
import { LOCKED, UNLOCKED, installApi } from '../mocks/api.ts';
import type { Credential } from '@zero/types';

const ENTRY: Credential = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'GitHub',
  username: 'chronos-atalante',
  password: 's3nh@-forte',
  domain: 'github.com',
  notes: '',
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_000_000_000,
};

describe('App', () => {
  it('mostra o desbloqueio só com o PIN quando não houve falhas', async () => {
    installApi({ status: LOCKED });

    render(<App />);

    expect(await screen.findByRole('button', { name: /Desbloquear/i })).toBeInTheDocument();
  });

  it('libera a senha mestra depois de três falhas de PIN', async () => {
    installApi({ status: { ...LOCKED, attempts: 3 } });

    render(<App />);

    expect(await screen.findByRole('button', { name: /Senha mestra/i })).toBeInTheDocument();
  });

  it('mostra a lista de credenciais com o cofre aberto', async () => {
    installApi({ status: UNLOCKED, entries: [ENTRY] });

    render(<App />);

    expect(await screen.findByText('GitHub')).toBeInTheDocument();
  });

  it('leva à criação do cofre quando ele não existe', async () => {
    installApi({ status: { ...UNLOCKED, exists: false } });

    render(<App />);

    expect(await screen.findByText(/Crie o seu cofre/i)).toBeInTheDocument();
  });
});

describe('botão de autodestruição', () => {
  it('exige a palavra de confirmação antes de apagar o cofre', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED });
    const destroy = vi.fn(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    api.vault.destroy = destroy;

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Autodestruição/i }));
    const action = await screen.findByRole('button', { name: /Destruir cofre/i });
    // sem a palavra, o botão de ação está desabilitado
    expect(action).toBeDisabled();

    await user.type(screen.getByLabelText(/Digite a palavra/i), 'DESTR');
    expect(action).toBeDisabled();

    await user.clear(screen.getByLabelText(/Digite a palavra/i));
    await user.type(screen.getByLabelText(/Digite a palavra/i), 'DESTRUIR');
    expect(action).toBeEnabled();

    expect(destroy).not.toHaveBeenCalled();
    await user.click(action);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('cancela sem apagar quando a palavra está errada', async () => {
    const user = userEvent.setup();
    const api = installApi({ status: UNLOCKED });
    const destroy = vi.fn(() => Promise.resolve({ ...UNLOCKED, exists: false }));
    api.vault.destroy = destroy;

    render(<App />);
    await user.click(await screen.findByRole('button', { name: /Autodestruição/i }));
    await user.type(screen.getByLabelText(/Digite a palavra/i), 'BANANA');
    expect(await screen.findByText(/O texto não confere/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(destroy).not.toHaveBeenCalled();
  });
});
