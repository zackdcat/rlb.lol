#!/bin/bash
echo "Total tokens bought:"
sqlite3 Database "SELECT SUM(tokens) FROM users;"