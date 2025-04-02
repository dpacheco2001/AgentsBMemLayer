#Overall state of the graph
#In this file, we define the the overall state of the graph.
#(reminder: We may need to separete input and output state besides the overall one).
#In this case, we will use the built-in "MessageState" state provided by Langgraph.

from typing import TypedDict
from langgraph.graph import MessagesState 

#The MessagesState only has a "messages" attribute, along with a reducer fuction called
#"add_messages". This reducer function helps us append new messages instead of overwriting them.

#We can extend this state and add more attributes if needed.

class OverallState(MessagesState):
    #We can add more attributes here
    user_id : str
    n_node:str









