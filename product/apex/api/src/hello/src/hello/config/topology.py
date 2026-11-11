from contract import Boundary, Topology

topology = Topology.declare([
    Boundary("gateway", "hello", "GET", "/hello", "anonymous", "hello.read", "-", "Greeting"),
    Boundary("gateway", "hello", "GET", "/hello/<name>", "anonymous", "hello.read", "Name", "Greeting"),
    Boundary("gateway", "hello", "GET", "/hello/me", "actor", "hello.read", "-", "Greeting"),
])
