#Code and logic for graph compilation
from .utils.state import OverallState
from .utils.nodes_edges import entry_node_memory,dig_into_memories, create_tool_node_with_fallback,tool_s,dig_into_memories_tool_condition
from langgraph.graph import StateGraph, MessagesState, END, START

from langgraph.prebuilt import tools_condition



builder = StateGraph(OverallState)
builder.add_node(entry_node_memory)
builder.add_node(dig_into_memories)
builder.add_node("tools", create_tool_node_with_fallback(tool_s))
builder.add_node("tools2", create_tool_node_with_fallback(tool_s))
builder.add_edge(START, "entry_node_memory")
builder.add_conditional_edges(
    "entry_node_memory",
    tools_condition,
)
builder.add_edge("tools", "dig_into_memories")
builder.add_conditional_edges(
    "dig_into_memories",
    dig_into_memories_tool_condition,
)
builder.add_edge("tools2", "dig_into_memories")



def compilegraph(checkpointer=None,long_term_memory=None):
    return builder.compile(checkpointer=checkpointer,store=long_term_memory)