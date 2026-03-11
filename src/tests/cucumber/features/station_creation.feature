Feature: Station Creation
  As a registered user
  I want to submit a new solar charging station
  So that it can be reviewed and listed on SolarSpot

  Background:
    Given the SolarSpot API is running

  Scenario: Unauthenticated user cannot create a station
    When I submit a new station without authentication
    Then the response status should be 401

  Scenario: Station creation fails when required fields are missing
    Given I am logged in as a station owner
    When I submit a new station with missing required fields
    Then the response status should be 422

  Scenario: Authenticated user submits a valid station successfully
    Given I am logged in as a station owner
    When I submit a new station with valid details
    Then the response status should be 201
    And the response should contain a success true field
    And the station should be in pending status
