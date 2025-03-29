from myagent.graph import compilegraph
from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore
from langchain_core.messages import HumanMessage


config = {"configurable": {"thread_id": 1, "user_id": "1"}}
memory = MemorySaver()
long_term_memory = InMemoryStore()

template_graph= compilegraph(checkpointer=memory,long_term_memory=long_term_memory)

while True:
    inp=input("Enter a message: ")
    if inp=="exit":
        break

    response=template_graph.invoke({"messages":HumanMessage(content=inp)},config)
    print("\n--------------------------\n")
    print("Human: ",inp)
    print("\n--------------------------\n")
    print("Assistant: ",response["messages"][-1].content)
    print("\n--------------------------\n")
