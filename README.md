# Tutorial: Implement cursor pagination with GraphQL and PostgreSQL

In this tutorial you will create a GraphQL API with Node.js and PostgreSQL that implements [Relay-style](https://relay.dev/docs/en/graphql-server-specification.html#schema) cursor pagination. 

* [ ] 0. Introduction to pagination with GraphQL
* [ ] 1. Set up your development environment
* [ ] 2. Create a PostgreSQL database
* [ ] 3. Update the GraphQL schema and resolvers

## 0. Introduction to pagination with GraphQL

There are two models for implementing pagination in a GraphQL API:

* **Limit/offset**: Specify how many objects to skip (offset) and how many objects to return (limit). For example, offset by 14 and limit by 4 to return objects 15 to 19 - or page 4 of the data set. You can jump from page 1 to page 5000 in your first query:

    ![Limit/offset pagination](images/offset-limit-example.png)

* **Cursor**: As you paginate through the data set, return a bookmark of your location (or 'cursor') that includes information about how to request the next and previous set of results. Cursors must be based on unique and sequential data, like an ID or a timestamp. For example, results 5 - 8 might have IDs 142, 150, 151, and 160, which means that results 9 - 12 must start with an ID greater than 160:

    ![Cursor pagination](images/cursor-example.png)

   You must paginate through the entire data set to reach page 5000 as there is no way to guess the first ID of the 5000th result set. Cursors are often returned to the client as an encoded value to indicate that the value cannot be guessed.

>Note: The pagination model you choose affects the backend implementation. Be aware that implementing cursor pagination in GraphQL does not mean that you have to use the underlying datastore's implementation of cursors. For example, this tutorial does not use PostgreSQL cursors.

Your choice of pagination model depends on your particular use case:

| **Pagination model**  	| **Pros**                                                                                                                                                                                                                                                                     	| **Cons**                                                                                                                                                                                                                                                                                                                                                                                	| **Use case**                                                                    	|
|-----------------------	|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------	|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------	|---------------------------------------------------------------------------------	|
| Limit/offset          	| <ul> <li>Transparent and simple to implement</li> <li>Supports ordering results by any property - for example, total purchase cost.</li> </ul>                                                                                                                               	|  <ul> <li>Does not scale well for large data sets. Skipping 100,000 results to get 100,000 - 100,010 still requires you to traverse the first 100,000 records.</li> <li>Possible duplication if data is added while you are paginating - for example, a query that returns purchases ordered by total cost may return the same record multiple times as purchases are added.</li> </ul> 	| Shallow pagination through search results ordered by relevance.                 	|
| Cursor                	| <ul> <li>Scales for large data sets. When you use a bookmark to results 100,000 to 100,010, you do not need to traverse the first 100,000 results.</li> <li>Duplication is unlikely as results are ordered by a sequential property such as an ID or a timestamp.</li> </ul> 	| <ul>  <li>Only supports jumping to the next or previous page - you cannot jump to page 10,000.</li>  <li>Results must be ordered by a unique and sequential property - like ID. You cannot order by total purchase cost.  </ul>                                                                                                                                                         	| Infinite scroll through a large and dynamic data set, such as a comments feed. 	|

## 0. Development environment prerequisites 

This tutorial requires you to install the following technologies:

* PostgreSQL (download from https://www.postgresql.org/download/)
* pgAdmin (download from: https://www.pgadmin.org/)
* Node.js (download from: https://nodejs.org/en/download/)

## 2. Create a PostgreSQL database

In this section you will:

1. Create a PostgreSQL database with a single table named Card
2. Populate the Card table with sample data

To create a PostgreSQL database:

1. Log in to pgAdmin.
2. Right-click on the **Servers** > **PostgreSQL** > **Databases** node and click **Create** > **Database**...
3. Name your database *magic-cards* and click **Save**.
4. Right-click on the **magic-cards** database node and click **Query Tool...** .
5. To create the Card table, paste the following SQL script into the Query Editor and press F5 to run the script:

    ```
    SET statement_timeout = 0;
    SET lock_timeout = 0;
    SET idle_in_transaction_session_timeout = 0;
    SET client_encoding = 'UTF8';
    SET standard_conforming_strings = on;
    SELECT pg_catalog.set_config('search_path', '', false);
    SET check_function_bodies = false;
    SET xmloption = content;
    SET client_min_messages = warning;
    SET row_security = off;

    SET default_tablespace = '';

    SET default_table_access_method = heap;

    CREATE TABLE public."Card" (
        "CardID" bigint NOT NULL,
        "CardName" character varying(150) NOT NULL,
        "CardOracleText" text,
        "CardFlavourText" text,
        "CardManaCost" character varying(40),
        "SetID" bigint
    );

    ALTER TABLE public."Card" OWNER TO postgres;

    ALTER TABLE public."Card" ALTER COLUMN "CardID" ADD GENERATED ALWAYS AS IDENTITY (
        SEQUENCE NAME public."Card_CardID_seq"
        START WITH 1
        INCREMENT BY 1
        NO MINVALUE
        NO MAXVALUE
        CACHE 1
    );

    CREATE INDEX "fki_FK_Card_Set" ON public."Card" USING btree ("SetID");
    ```

6. To populate the Card table with sample data, paste the following SQL script into the Query Editor and press F5 to run the script:

    ```
    INSERT INTO public."Card" ("CardID", "CardName", "CardOracleText", "CardFlavourText", "CardManaCost", "SetID") OVERRIDING SYSTEM VALUE VALUES (3, 'Predatory Urge', NULL, NULL, NULL, NULL);
    INSERT INTO public."Card" ("CardID", "CardName", "CardOracleText", "CardFlavourText", "CardManaCost", "SetID") OVERRIDING SYSTEM VALUE VALUES (1, 'Consuming Aberration', 'Consuming Aberration''s power and toughness are each equal to the number of cards in your opponents'' graveyards. Whenever you cast a spell, each opponent reveals cards from the top of their library until they reveal a land card, then puts those cards into their graveyard.', NULL, NULL, NULL);
    INSERT INTO public."Card" ("CardID", "CardName", "CardOracleText", "CardFlavourText", "CardManaCost", "SetID") OVERRIDING SYSTEM VALUE VALUES (2, 'Verdant Fields', NULL, 'Jolrael tends the land so that the land will tend the beasts.', NULL, NULL);
    INSERT INTO public."Card" ("CardID", "CardName", "CardOracleText", "CardFlavourText", "CardManaCost", "SetID") OVERRIDING SYSTEM VALUE VALUES (4, 'Dragonlord Ojutai', 'Flying Dragonlord Ojutai has hexproof as long as it''s untapped. Whenever Dragonlord Ojutai deals combat damage to a player, look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.', NULL, NULL, NULL);
    INSERT INTO public."Card" ("CardID", "CardName", "CardOracleText", "CardFlavourText", "CardManaCost", "SetID") OVERRIDING SYSTEM VALUE VALUES (5, 'Drudge Skeletons', NULL, 'The dead make good soldiers. They can''t disobey orders, never surrender, and don''t stop fighting when a random body part falls off." —Nevinyrral, Necromancer''s Handbook', NULL, NULL);
    INSERT INTO public."Card" ("CardID", "CardName", "CardOracleText", "CardFlavourText", "CardManaCost", "SetID") OVERRIDING SYSTEM VALUE VALUES (6, 'Coalition Victory', 'You win the game if you control a land of each basic land type and a creature of each color.', 'You can build a perfect machine out of imperfect parts.
    —Urza', '8', 2);
    INSERT INTO public."Card" ("CardID", "CardName", "CardOracleText", "CardFlavourText", "CardManaCost", "SetID") OVERRIDING SYSTEM VALUE VALUES (7, 'Sandsteppe Mastodon', 'When Sandsteppe Mastodon enters the battlefield, bolster 5. (Choose a creature with the least toughness among creatures you control and put five +1/+1 counters on it.)', '', '7', 2);
    ```

7. To see all cards, run the following SQL script:

    ```
    SELECT * FROM public."Card"
    ```

## 3. Create a GraphQL server in Node.js

To create and run a simple GraphQL server in Node.js:

1. Create a folder named *magic-cards* - for example, under \projects\magic-cards.
2. Open your terminal and run the following command in the **magic-cards** folder:

    `npm init`

3. Install the [express](https://www.npmjs.com/package/express), [express-graphql](https://www.npmjs.com/package/express-graphql), and [https://www.npmjs.com/package/pg](pg) modules:

    `npm install express express-graphql pg --save`

4. Create an index.js file:

    > NOTE: This tutorial assumes that the primary entry point for your program is `index.js` (defined by the `main` parameter in `package.json`)

5. Paste the following scaffolding into `index.js`:

    ```
    var express = require('express');
    var graphqlHTTP = require('express-graphql');
    var { buildSchema } = require('graphql');

    // Sample schema
    var schema = buildSchema(`
    type Query {
        cards: String
        }
    `);

    // Resolvers placeholder
    var root = {
    cards: () => {
        return 'These are cards!';
        },
    };

    var app = express();

    app.use('/graphql', graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
    }));

    app.listen(4000);

    console.log('Listening on 4000');
    ```
6. Run the following command in your terminal:

    `node index.js` 

7. Browse to http://localhost:4000/graphql - the graphql-express package includes the GraphiQL interface, which allows you to issue GraphQL queries.

8. Run the following query in the GraphiQL tool:

    ```
    {
        cards
    }
    ```

    You should get the following result:

    ```
    {
    "data": {
        "cards": "These are cards!"
        }
    }    
    ```

## 3. Update the GraphQL schema and resolvers

The [Relay specification](https://facebook.github.io/relay/graphql/connections.htm) defines a standard format for handling cursor pagination with GraphQL.

In this section you will:

1. Create a schema for querying cards that follows the Relay specification and includes a Card type.
2. Update the sample query resolver and return sample cards.

To update the GraphQL schema and query resolver in `index.js`:

1. Remove the sample schema:

    ```
    var schema = buildSchema(`
    type Query {
        cards: String
        }
    `);
    ```

2. Insert the following schema:

    ```
    var schema = buildSchema(`
    type Query {
        paginatedCards(first: Int, after: String, name: String): CardConnection
    }

    type CardConnection {
        totalCount: Int,
        pageInfo: PageInfo,
        edges: [CardEdge]
    }

    type CardEdge {
        cursor: String
        node: Card
        }

        type PageInfo {
            lastCursor: String
            hasNextPage: Boolean
        }
    
    type Card {
        CardID: ID!
        CardName: String
        CardFlavorText: String
        CardOracleText: String
    }
    `);
    ```
    * The `Card` type defines the properties of a card and maps to a row in the Card database table.
    * The `CardConnection` wraps the result of a query and includes a list of results and information about the current result set (or 'page').
    * The `PageInfo` type includes the last available cursor and whether or not more data is available.
    * The `CardEdge` type includes a list of cards (represented by `CardEdge`, which defines a `cursor` and a `node` of type `Card`).
    * The `paginatedCards` query accepts a card ID, a cursor (`after`), and the number of records to return (`first`)).

3. Remove the sample query resolver:

    ```
    var root = {
    cards: () => {
        return 'These are cards!';
        },
    };    
    ```

4. Insert the following query resolver, which returns a sample `CardConnection` object:

    ```
    var root = {
        paginatedCards: async ({
            first,
            after,
            name
        }) => {
            return {
                totalCount: 20,
                pageInfo: {
                    lastCursor: 'sampleCursor',
                    hasNextPage: true      
                    },   
                edges: [{
                        cursor: 'sampleEdgeCursor',
                        node: {
                            CardID: 224,
                            CardName: "Name sample"
                        }
                    },
                    {
                        cursor: 'sampleEdgeCursor2',
                        node: {
                            CardID: 220,
                            CardName: "Name sample"
                        }
                    }]
            }
        },
    };
    ```

5. Restart your GraphQL server and run the following query in the GraphiQL tool:

    ```
    {
        paginatedCards {
            totalCount
            pageInfo {
                lastCursor
                hasNextPage
            }
            edges {
                cursor
                node {
                    CardID
                }
            }
        }
    }
    ```
    You should get the following result:

    ```
    {
        "data": {
            "paginatedCards": {
            "totalCount": 20,
            "pageInfo": {
                "lastCursor": "sampleCursor",
                "hasNextPage": true
            },
            "edges": [
                    {
                    "cursor": "sampleEdgeCursor",
                    "node": {
                        "CardID": "224"
                        }
                    },
                    {
                    "cursor": "sampleEdgeCursor2",
                    "node": {
                        "CardID": "220"
                        }
                    }
                ]
            }
        }
    }    
    ```

### 5. Implement query and resolver

## FAQ

### Does a GraphQL cursor have anything to do with a SQL cursor?

Not necessarily!