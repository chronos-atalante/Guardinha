import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '@zero/renderer/App';
import type { ElectronApi, Credential, VaultStatus } from '@zero/types';

const UNLOCKED: VaultStatus = {
  exists: true,
  locked: false,
  attempts: 0,
  lockUntil: null,
  lockRemainingMs: 0,
};

const LOCKED: VaultStatus = {
  exists: true,
  locked: true,
  attempts: 0,
  lockUntil: null,
  lockRemainingMs: 0,
};

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

function installApi(status: VaultStatus, entries: Credential[]): ElectronApi {
  const api: ElectronApi = {
    vault: {
      status: () => Promise.resolve(status),
      create: () => Promise.resolve({ ok: false, error: 'não usado', status }),
      unlock: () => Promise.resolve({ ok: false, error: 'não usado', status }),
      resetPin: () => Promise.resolve({ ok: false, error: 'não usado', status }),
      lock: () => Promise.resolve(status),
      onAutoLocked: () => () => {
        // sem auto-lock exercitado aqui
      },
    },
    openDomain: () => Promise.resolve(),
    clipboard: { copy: () => Promise.resolve() },
    entries: {
      list: () => Promise.resolve(entries),
      save: () => Promise.resolve(entries),
      remove: () => Promise.resolve([]),
    },
    generator: {
      generate: () => Promise.resolve('senha-gerada-123'),
    },
    settings: {
      get: () => Promise.resolve({ language: 'pt-BR' }),
      set: (settings) => Promise.resolve(settings),
    },
  };
  window.api = api;
  return api;
}

describe('App', () => {
  it('mostra o desbloqueio só com o PIN quando não houve falhas', async () => {
    installApi(LOCKED, []);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Cofre bloqueado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PIN' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Senha mestra' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esqueci o PIN' })).toBeInTheDocument();
  });

  it('oferece a senha mestra como login após 3 falhas de PIN', async () => {
    installApi({ ...LOCKED, attempts: 3 }, []);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'PIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Senha mestra' })).toBeInTheDocument();
    expect(
      screen.getByText('PIN incorreto 3 vezes: agora a senha mestra também pode abrir o cofre.'),
    ).toBeInTheDocument();
  });

  it('renderiza a sidebar e a lista de credenciais com o cofre aberto', async () => {
    installApi(UNLOCKED, [ENTRY]);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Início (Senhas)' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Senhas' })).toBeInTheDocument();
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(await screen.findByText('1 credencial(is)')).toBeInTheDocument();
    expect(screen.getByText('100% Local / Criptografado')).toBeInTheDocument();
  });

  it('navega até o gerador e gera uma senha via IPC', async () => {
    const user = userEvent.setup();
    installApi(UNLOCKED, []);

    render(<App />);
    await screen.findByRole('button', { name: 'Início (Senhas)' });

    await user.click(screen.getByRole('button', { name: 'Gerador de Senhas' }));
    expect(await screen.findByRole('heading', { name: 'Gerador de Senhas' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Gerar Senha Criptográfica' }));
    expect(await screen.findByText('senha-gerada-123')).toBeInTheDocument();
  });

  it('abre a tela de configurações com o aviso de implementação futura', async () => {
    const user = userEvent.setup();
    installApi(UNLOCKED, []);

    render(<App />);
    await screen.findByRole('button', { name: 'Início (Senhas)' });

    await user.click(screen.getByRole('button', { name: 'Configurações' }));
    expect(await screen.findByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Em breve' })).toBeInTheDocument();
    expect(screen.getByText(/serão implementadas em uma versão futura/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Idioma' })).toBeInTheDocument();
  });

  it('exibe a tela de criação quando não existe cofre', async () => {
    installApi({ ...UNLOCKED, exists: false, locked: true }, []);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Crie o seu cofre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avançar' })).toBeInTheDocument();
  });
});
