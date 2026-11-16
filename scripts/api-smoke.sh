#!/bin/bash
# API SMOKE TEST: calls main routes, prints each response
# (1) START SERVER: node server.js (terminal 1)
# (2) RUN: bash scripts/smoke.sh (terminal 2)
# each run leaves test rows in the db

# $RANDOM: built-in bash var, gens random int (goal: reduce db collisions)
TEST_USERNAME="smoke$RANDOM$RANDOM"

# send POST request to specified API route & print response
# bash args:
#   $1: test description (printed before response)
#   $2: API route
#   $3: JSON request body
post() {
    echo "--- $1"

    # curl options:
    #   -sS: hide progress output, still display errors (readability)
    #   -X: specify HTTP method (POST)
    #   -H: set request header (JSON content type)
    #   -d: sends JSON request body
    #   sed: replace test username in response with "USER" (readability)
    curl -sS -X POST "localhost:5001/api/$2" \
        -H 'Content-Type: application/json' \
        -d "$3" | sed "s/$TEST_USERNAME/USER/g"

    # print blank line in terminal (readability)
    echo

    # wait briefly before next request (give db time to finish writing)
    sleep 0.5
}

# same as post(), but extracts only the "error" field from the response
# (these routes may also return a whole user row)
postError() {
    echo "--- $1"

    # sed -E: enables extended regex to extract the "error" field
    curl -sS -X POST "localhost:5001/api/$2" \
        -H 'Content-Type: application/json' \
        -d "$3" | sed -E 's/.*("error":[^}]*)\}.*/\1/'

    echo
    sleep 0.5
}

# ==============================================================================
# FUNCTIONS
# ==============================================================================

typing() {
    echo "{
        \"username\":\"$1\",
        \"speed\":\"42\",
        \"accuracy\":\"95\",
        \"score\":$2,
        \"date\":\"d\",
        \"device\":\"Computer\"
    }";
}

reaction() {
    echo "{
        \"username\":\"$TEST_USERNAME\",
        \"time\":$1,
        \"date\":\"d\",
        \"device\":\"Computer\"
    }";
}

who() {
    echo "{
        \"username\":\"$TEST_USERNAME\"
    }";
}

account() {
    echo "{
        \"username\":\"$TEST_USERNAME\",
        \"email\":\"$TEST_USERNAME@example.com\",
        \"password\":\"$1\"
    }";
}

login() {
    echo "{
        \"username\":\"$TEST_USERNAME\",
        \"password\":\"$1\"
    }";
}

# ==============================================================================
# API TESTS
# ==============================================================================

# TYPING DATA ------------------------------------------------------------------
post "typing: new user"  addTypingData  "$(typing "$TEST_USERNAME" 3990)"
post "typing: lower score"  addTypingData  "$(typing $TEST_USERNAME 100)"
post "typing: read it back"  userTypingData  "$(who)"
post "typing: higher score"  addTypingData  "$(typing $TEST_USERNAME 5000)"
post "typing: read it back"  userTypingData  "$(who)"
post "typing: guest"  addTypingData  "$(typing Guest 10)"

# REACTION DATA ----------------------------------------------------------------
post "reaction: new user"  addReactionData  "$(reaction 300)"
post "reaction: slower"  addReactionData  "$(reaction 400)"
post "reaction: read it back"  userReactionData  "$(who)"
post "reaction: faster"  addReactionData  "$(reaction 200)"
post "reaction: read it back"  userReactionData  "$(who)"

# ACCOUNT & AUTH ---------------------------------------------------------------
post "signup: new user"  signup  "$(account pw12345)"
post "signup: same again"  signup  "$(account pw12345)"
postError "userCheck: exists"  userCheck  "$(who)"
post "userCheck: new name"  userCheck  "{\"username\":\"nobody$TEST_USERNAME\"}"
postError "email: exists"  email  "$(account x)"
post "email: unknown"  email  "{\"email\":\"nobody@example.com\"}"
post "login: not validated"  users  "$(login pw12345)"
post "login: wrong password"  users  "$(login wrong)"
post "verify: wrong code"  verify  \
    "{\"email\":\"$TEST_USERNAME@example.com\",\"code\":0}"
post "password: change it"  updatepassword  "$(account newpw789)"
post "login: new password"  users  "$(login newpw789)"
post "login: old password"  users  "$(login pw12345)"
