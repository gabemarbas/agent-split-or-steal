import { logger } from '@elizaos/core';
import type {
  GameState,
  GamePhase,
  GameChoice,
  GameResult,
  GameConfig,
  ChatMessage,
  GamePlayer,
} from '../types/index.js';
import { DEFAULT_CONFIG } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * GameManager handles all game state and logic.
 * It stores active and completed games, manages the game lifecycle,
 * and resolves outcomes based on the Split or Steal payoff matrix.
 */
export class GameManager {
  private activeGames: Map<string, GameState> = new Map();
  private completedGames: GameResult[] = [];
  private config: GameConfig;

  constructor(config?: Partial<GameConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new game between two agents.
   */
  createGame(
    playerA: { agentId: string; agentName: string; walletAddress?: string },
    playerB: { agentId: string; agentName: string; walletAddress?: string },
    roomId: string,
  ): GameState {
    const gameId = uuidv4();
    const game: GameState = {
      gameId,
      phase: 'negotiating',
      pot: this.config.buyIn * 2,
      buyIn: this.config.buyIn,
      chatRounds: this.config.chatRounds,
      currentRound: 0,
      playerA: { ...playerA, payout: 0 },
      playerB: { ...playerB, payout: 0 },
      chatHistory: [],
      roomId,
      createdAt: Date.now(),
    };

    this.activeGames.set(gameId, game);
    logger.info(`Game ${gameId} created: ${playerA.agentName} vs ${playerB.agentName}, pot: ${game.pot}`);
    return game;
  }

  /**
   * Add a chat message to the game.
   */
  addChatMessage(gameId: string, message: Omit<ChatMessage, 'timestamp'>): GameState | null {
    const game = this.activeGames.get(gameId);
    if (!game || game.phase !== 'negotiating') return null;

    game.chatHistory.push({ ...message, timestamp: Date.now() });

    // Check if we've completed all rounds (2 messages per round: one from each player)
    const messagesPerRound = 2;
    const totalMessages = game.chatRounds * messagesPerRound;
    if (game.chatHistory.length >= totalMessages) {
      game.phase = 'deciding';
      logger.info(`Game ${gameId}: Negotiation complete, moving to decision phase`);
    }

    // Update round counter
    game.currentRound = Math.floor(game.chatHistory.length / messagesPerRound);

    return game;
  }

  /**
   * Record a player's decision.
   */
  recordDecision(gameId: string, agentId: string, choice: GameChoice): GameState | null {
    const game = this.activeGames.get(gameId);
    if (!game || game.phase !== 'deciding') return null;

    if (game.playerA.agentId === agentId) {
      game.playerA.choice = choice;
    } else if (game.playerB.agentId === agentId) {
      game.playerB.choice = choice;
    } else {
      logger.warn(`Game ${gameId}: Unknown agent ${agentId} tried to submit decision`);
      return null;
    }

    // If both players have decided, resolve the game
    if (game.playerA.choice && game.playerB.choice) {
      return this.resolveGame(gameId);
    }

    return game;
  }

  /**
   * Apply the payoff matrix and resolve the game.
   */
  private resolveGame(gameId: string): GameState | null {
    const game = this.activeGames.get(gameId);
    if (!game) return null;

    const choiceA = game.playerA.choice!;
    const choiceB = game.playerB.choice!;

    let outcome: GameResult['outcome'];

    if (choiceA === 'SPLIT' && choiceB === 'SPLIT') {
      game.playerA.payout = game.pot / 2;
      game.playerB.payout = game.pot / 2;
      outcome = 'both_split';
    } else if (choiceA === 'STEAL' && choiceB === 'SPLIT') {
      game.playerA.payout = game.pot;
      game.playerB.payout = 0;
      outcome = 'a_steals';
    } else if (choiceA === 'SPLIT' && choiceB === 'STEAL') {
      game.playerA.payout = 0;
      game.playerB.payout = game.pot;
      outcome = 'b_steals';
    } else {
      game.playerA.payout = 0;
      game.playerB.payout = 0;
      outcome = 'both_steal';
    }

    game.phase = 'resolved';
    game.resolvedAt = Date.now();

    // Store result
    this.completedGames.push({
      gameId,
      playerA: { ...game.playerA },
      playerB: { ...game.playerB },
      pot: game.pot,
      outcome,
    });

    // Remove from active games
    this.activeGames.delete(gameId);

    logger.info(
      `Game ${gameId} resolved: ${game.playerA.agentName}=${choiceA}, ${game.playerB.agentName}=${choiceB} → ${outcome}`,
    );

    return game;
  }

  getGame(gameId: string): GameState | undefined {
    return this.activeGames.get(gameId);
  }

  getActiveGames(): GameState[] {
    return Array.from(this.activeGames.values());
  }

  getCompletedGames(): GameResult[] {
    return [...this.completedGames];
  }

  getAgentActiveGame(agentId: string): GameState | undefined {
    return Array.from(this.activeGames.values()).find(
      (g) => g.playerA.agentId === agentId || g.playerB.agentId === agentId,
    );
  }

  getConfig(): GameConfig {
    return { ...this.config };
  }
}
