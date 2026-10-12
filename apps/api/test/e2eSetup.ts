import http from 'node:http';

// Node 19+ keeps client sockets alive by default. Supertest's pooled sockets
// can then outlive the server they were opened to and either hang up or be
// paired with another request's response, which made e2e runs flaky.
// Every test request opens its own connection instead.
http.globalAgent = new http.Agent({ keepAlive: false });
