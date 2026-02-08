import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { challengeAction } from './actions/challenge.js';
import { negotiateAction } from './actions/negotiate.js';
import { decideAction } from './actions/decide.js';
import { gameStateProvider } from './providers/gameStateProvider.js';

export const splitOrStealPlugin: Plugin = {
  name: 'plugin-split-or-steal',
  description: 'Split or Steal — a game theory game where two AI agents negotiate then choose to split or steal a pot of tokens',

  actions: [challengeAction, negotiateAction, decideAction],
  providers: [gameStateProvider],

  init: async (config, runtime) => {
    logger.info('Split or Steal plugin initialized');
    logger.info(`Agent "${runtime.character?.name}" is ready to play Split or Steal`);
  },
};

// Export everything for external use
export default splitOrStealPlugin;
export { challengeAction, negotiateAction, decideAction };
export { gameStateProvider, getGameManager } from './providers/gameStateProvider.js';
export { GameManager } from './services/gameManager.js';
export * from './types/index.js';
