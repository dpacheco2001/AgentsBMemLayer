#Code and logic for graph compilation
from .utils.state import OverallState
from .utils.nodes_edges import dig_into_memories,dig_into_memories_tool_condition,analazing_next_node
from langgraph.graph import StateGraph, MessagesState, END, START

from langgraph.prebuilt import tools_condition



builder = StateGraph(OverallState)

builder.add_node("dig_into_memories",dig_into_memories)
builder.add_node("analazing_next_node", analazing_next_node)
builder.add_edge(START, "dig_into_memories")
builder.add_edge("dig_into_memories", "analazing_next_node")
builder.add_conditional_edges(
    "dig_into_memories",
    dig_into_memories_tool_condition,
)
builder.add_edge("tools2", "dig_into_memories")



def compilegraph(checkpointer=None,long_term_memory=None):
    return builder.compile(checkpointer=checkpointer,store=long_term_memory)