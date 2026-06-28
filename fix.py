import re
return re.sub(rb"Co-Authored-By: Claude.*\n?", b"", message, flags=re.IGNORECASE)