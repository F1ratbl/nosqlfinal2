# Facebook Clone with Neo4j
Ogrenci: Fırat Bali
Okul No: 23080410303

## About The Project

This is a complete backend implementation of a simplified social network resembling Facebook. It leverages the power of Neo4j Graph Database to handle complex relation-centric queries like "Friends of Friends" calculations and "Messenger Graph Authorization". 

The backend is built with Node.js and Express.js, featuring graph constraints natively provisioned with a custom Cypher synchronizer script running strictly off Docker Compose.

## How to Run

1. Make sure you have Docker and Docker Compose installed.
2. In the project root folder (where `docker-compose.yml` is located), simply run:
   ```bash
   docker-compose up --build
   ```
3. The database constraints (UNIQUENESS constraints) are automatically applied on the first run.
4. Your endpoints are immediately available at `http://localhost:3000`. Neo4j UI is at `http://localhost:7474`.

## API Endpoints List

### Health & Utils
- `GET /health` : Verify Neo4j connectivity status.

### Users & Relationships
- `POST /register` : Regiser a new `(:Person)`.
- `GET /users/:username` : Returns user details.
- `POST /friend-request` : Submits `[:FRIEND_REQUEST]`.
- `POST /friend-accept` : Accepts a request into an undirected `[:FRIEND]` structure.
- `GET /users/:username/friends` : Retrieves explicit friends (1 hop).

### Posts & News Feed
- `POST /posts` : Create `(:Post)` nodes governed by varying visibility thresholds (public, friends, friends_of_friends, private).
- `POST /posts/:post_id/like` : Link user to post via `[:LIKED]`.
- `GET /users/:username/posts` : All posts authored by a user.
- `GET /feed/:username` : Complex News Feed generation evaluated entirely via a Cypher existential path subquery routing.

### Graph Algorithmic Traversal
- `GET /users/:username/friends-of-friends` : Nodes 2 hops away exactly.
- `GET /users/:username/mutual-friends/:other` : Common intersecting friends.
- `GET /users/:username/suggestions` : Recommend friends by heavily shared mutual clusters.

### Secure Graph Messaging
- `POST /messages` : Generate a message (Validates that Sender & Receiver are at most 2 hops apart in the social graph structure, refusing if false — simulated 403 Forbidden).
- `GET /messages/:username` : Inbox retrieval structured by `[:SENT]` and `[:TO]` relation flows.
# nosqlfinal2
