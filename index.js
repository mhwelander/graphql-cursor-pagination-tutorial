var express = require('express');
var graphqlHTTP = require('express-graphql');
var { buildSchema } = require('graphql');
const { Pool } = require('pg')

const pool = new Pool({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'mtg',
    password: 'Test789',
    port: 5432,
});

// Construct a schema, using GraphQL schema language
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

var root = {
    paginatedCards: async ({
        first,
        after,
        name
    }) => {
        try {
            var decodedAfter = (after != null) ? decode(after) : 0;

            console.log(name);

            // Request a client from the pool
            const client = await pool.connect();
            const values = [decodedAfter, first, name]

            var text = 'SELECT * FROM public."Card"  WHERE "CardID" > $1 AND ("CardName" = $3 OR $3 IS NULL) ORDER BY "CardID" ASC LIMIT $2';

            // Send query with variables to PostgreSQL database
            var results = await client.query(text, values);

            // End connection when we have results
            await client.end();

            const r = results.rows.map(s => {
                return {
                    cursor: encode(s.CardID),
                    node: s
                }
            })

            // Build card connection
            var lastCursor = r[r.length - 1];

            var connection = {
                totalCount: results.rowCount,
                pageInfo: {
                    lastCursor: lastCursor.cursor,
                    hasNextPage: (results.rowCount == first)
                },
                edges: r
            }

            return connection;

        } catch (error) {
            console.log(error);
        }
    },
};

var app = express();

app.use('/graphql', graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
}));

app.listen(4000);

// Encode/decode helper methods
const decode = (value) => {
    let originalData = value;
    let buff = Buffer.from(originalData, 'base64');
    let decodedData = buff.toString('utf-8');

    return decodedData;
}

const encode = (value) => {
    let originalData = value;
    let buff = Buffer.from(originalData);
    let encodedData = buff.toString("base64");

    return encodedData;
}

console.log('Running a GraphQL API server at http://localhost:4000/graphql');