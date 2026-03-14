Feature: User Authentication
  As a visitor
  I want to register an account and log in
  So that I can use the secure features of SolarSpot

  Scenario: Successfully registering a new user
    Given the SolarSpot API is running
    When I register a new user with display name "BDD Test User", email "testuser@solarspot.com" and password "password123"
    Then the response status should be 201
    And the response should contain a success true field

  Scenario: Registering a user with an existing email fails
    Given the SolarSpot API is running
    When I register a new user with display name "BDD Test User", email "testuser@solarspot.com" and password "password123"
    Then the response status should be 409

  Scenario: Successfully logging in with correct credentials
    Given the SolarSpot API is running
    When I log in with email "user@solarspot.app" and password "User@2026!"
    Then the response status should be 200
    And the response should contain a success true field
    And the response data should have an access token

  Scenario: Logging in with incorrect password fails
    Given the SolarSpot API is running
    When I log in with email "user@solarspot.app" and password "wrongpassword"
    Then the response status should be 401
