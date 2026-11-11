from engine.http import Group, Route

def api ( name: str, *routes: Route | Group ) -> Group:

    return Group.of("", *routes, name=name)
