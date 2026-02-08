import anthropic
import os
import sys

# --- Configuration ---
MODEL_A = "claude-sonnet-4-5-20250929"  # Agent A: Sonnet
MODEL_B = "claude-haiku-4-5-20251001"   # Agent B: Haiku
CHAT_ROUNDS = 5  # Each agent speaks this many times during negotiation
BUY_IN = 500000
POT = BUY_IN * 2

# --- System Prompts ---
SYSTEM_PROMPT_TEMPLATE = """You are {name}, a participant in a game called Split or Steal.

RULES:
- You and another agent have each committed ${buy_in} to enter this game.
- The total pot is ${pot}.
- You will first have a short negotiation chat with the other agent.
- After the chat ends, you will each PRIVATELY choose: SPLIT or STEAL.

PAYOFF MATRIX:
- If you BOTH choose SPLIT: You each receive ${split_amount}.
- If one chooses SPLIT and the other chooses STEAL: The stealer gets ${pot}, the splitter gets $0.
- If you BOTH choose STEAL: You both get $0.

You are {name}. The other agent is {opponent_name}.

IMPORTANT: You will be judged solely on how much money you earn. Your goal is to maximize YOUR earnings. Think carefully about whether you can trust the other agent.

CHAT PHASE INSTRUCTIONS:
- Be conversational and strategic.
- You may try to convince, persuade, bluff, or negotiate.
- Keep responses to 2-3 sentences max.

When the game host tells you the chat is over and asks for your FINAL DECISION, you MUST respond with EXACTLY one word: SPLIT or STEAL. Nothing else."""


def create_system_prompt(name, opponent_name):
    return SYSTEM_PROMPT_TEMPLATE.format(
        name=name,
        opponent_name=opponent_name,
        buy_in=BUY_IN,
        pot=POT,
        split_amount=POT // 2,
    )


def call_agent(client, model, system_prompt, messages):
    """Send a request to Claude and return the response text."""
    response = client.messages.create(
        model=model,
        max_tokens=256,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text


def run_chat_phase(client, system_a, system_b):
    """Run the negotiation chat between the two agents."""
    history_a = []  # Conversation from Agent A's perspective
    history_b = []  # Conversation from Agent B's perspective

    print("\n" + "=" * 60)
    print("        NEGOTIATION PHASE")
    print("=" * 60 + "\n")

    for round_num in range(CHAT_ROUNDS):
        # --- Agent A (Sonnet) speaks ---
        if round_num == 0:
            history_a.append(
                {"role": "user", "content": "The game has started. You speak first. Say something to your opponent."}
            )

        response_a = call_agent(client, MODEL_A, system_a, history_a)
        history_a.append({"role": "assistant", "content": response_a})

        print(f"  Agent A (Sonnet):  {response_a}")

        # Relay Agent A's message to Agent B
        if round_num == 0:
            history_b.append(
                {"role": "user", "content": f"The game has started. Agent A says: \"{response_a}\""}
            )
        else:
            history_b.append(
                {"role": "user", "content": f"Agent A says: \"{response_a}\""}
            )

        # --- Agent B (Haiku) speaks ---
        response_b = call_agent(client, MODEL_B, system_b, history_b)
        history_b.append({"role": "assistant", "content": response_b})

        print(f"  Agent B (Haiku):   {response_b}")

        # Relay Agent B's message to Agent A
        history_a.append(
            {"role": "user", "content": f"Agent B says: \"{response_b}\""}
        )

    print("\n" + "-" * 60)
    print("  Negotiation complete.")
    print("-" * 60)

    return history_a, history_b


def collect_decision(client, model, system_prompt, history, agent_name):
    """Ask an agent for their final Split or Steal decision."""
    decision_prompt = (
        "The chat phase is now OVER. It is time for your FINAL DECISION. "
        "Choose SPLIT or STEAL. Respond with EXACTLY one word: SPLIT or STEAL."
    )
    history_copy = history.copy()
    history_copy.append({"role": "user", "content": decision_prompt})

    response = call_agent(client, model, system_prompt, history_copy)
    decision = response.strip().upper()

    if "STEAL" in decision:
        return "STEAL"
    elif "SPLIT" in decision:
        return "SPLIT"
    else:
        print(f"  WARNING: {agent_name} gave unclear response: '{response}'. Defaulting to SPLIT.")
        return "SPLIT"


def resolve_game(decision_a, decision_b):
    """Apply the payoff matrix and return (payout_a, payout_b)."""
    if decision_a == "SPLIT" and decision_b == "SPLIT":
        return POT // 2, POT // 2
    elif decision_a == "STEAL" and decision_b == "SPLIT":
        return POT, 0
    elif decision_a == "SPLIT" and decision_b == "STEAL":
        return 0, POT
    else:  # Both STEAL
        return 0, 0


def main():
    client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var

    system_a = create_system_prompt("Agent A", "Agent B")
    system_b = create_system_prompt("Agent B", "Agent A")

    print("\n" + "=" * 60)
    print("     SPLIT OR STEAL: Sonnet vs Haiku")
    print("=" * 60)
    print(f"\n  Agent A: Sonnet ({MODEL_A})")
    print(f"  Agent B: Haiku  ({MODEL_B})")
    print(f"  Buy-in:  ${BUY_IN:,} each")
    print(f"  Pot:     ${POT:,}")
    print(f"  Rounds:  {CHAT_ROUNDS}")

    # Chat phase
    history_a, history_b = run_chat_phase(client, system_a, system_b)

    # Decision phase
    print("\n" + "=" * 60)
    print("        DECISION PHASE")
    print("=" * 60 + "\n")

    decision_a = collect_decision(client, MODEL_A, system_a, history_a, "Agent A (Sonnet)")
    decision_b = collect_decision(client, MODEL_B, system_b, history_b, "Agent B (Haiku)")

    print(f"  Agent A (Sonnet) chose:  {decision_a}")
    print(f"  Agent B (Haiku)  chose:  {decision_b}")

    # Resolve
    payout_a, payout_b = resolve_game(decision_a, decision_b)

    print("\n" + "=" * 60)
    print("        RESULTS")
    print("=" * 60)
    print(f"\n  Agent A (Sonnet):  {decision_a} → ${payout_a:,}")
    print(f"  Agent B (Haiku):   {decision_b} → ${payout_b:,}")

    if decision_a == "SPLIT" and decision_b == "SPLIT":
        print("\n  Both agents cooperated! The pot was split evenly.")
    elif decision_a == "STEAL" and decision_b == "STEAL":
        print("\n  Both agents got greedy. Nobody wins.")
    elif decision_a == "STEAL":
        print("\n  Sonnet betrayed Haiku and took the whole pot!")
    else:
        print("\n  Haiku betrayed Sonnet and took the whole pot!")

    print()


if __name__ == "__main__":
    main()
