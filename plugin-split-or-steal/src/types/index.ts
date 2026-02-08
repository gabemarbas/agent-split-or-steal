export type GamePhase = 'waiting' | 'negotiating' | 'deciding' | 'resolved';
export type GameChoice = 'SPLIT' | 'STEAL';

export interface GamePlayer {
  agentId: string;
  agentName: string;
  walletAddress?: string;
  choice?: GameChoice;
  payout: number;
}

export interface GameState {
  gameId: string;
  phase: GamePhase;
  pot: number;
  buyIn: number;
  chatRounds: number;
  currentRound: number;
  playerA: GamePlayer;
  playerB: GamePlayer;
  chatHistory: ChatMessage[];
  twitterThreadId?: string;
  roomId: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface ChatMessage {
  agentId: string;
  agentName: string;
  text: string;
  timestamp: number;
  tweetId?: string;
}

export interface GameResult {
  gameId: string;
  playerA: GamePlayer;
  playerB: GamePlayer;
  pot: number;
  outcome: 'both_split' | 'a_steals' | 'b_steals' | 'both_steal';
}

export interface GameConfig {
  buyIn: number;
  chatRounds: number;
  tweetDelayMs: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  buyIn: 10,
  chatRounds: 5,
  tweetDelayMs: 45000,
};
