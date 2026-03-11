Feature: Solar Station Browsing
  As a visitor or registered user
  I want to browse and search solar charging stations
  So that I can find convenient charging points

  Background:
    Given the SolarSpot API is running

  Scenario: List all active stations returns a successful response
    When I request the list of all stations
    Then the response status should be 200
    And the response should contain a success true field
    And the response data should be an array

  Scenario: List stations with pagination parameters
    When I request the list of stations with page 1 and limit 5
    Then the response status should be 200
    And the response should contain a success true field

  Scenario: Search stations by a keyword
    When I search for stations with keyword "Colombo"
    Then the response status should be 200
    And the response should contain a success true field
    And the response data should be an array

  Scenario: Search endpoint requires a query parameter
    When I search for stations without providing a keyword
    Then the response status should be 422

  Scenario: Find stations near a valid location
    When I request nearby stations at latitude 6.9271 and longitude 79.8612
    Then the response status should be 200
    And the response should contain a success true field
    And the response data should be an array

  Scenario: Nearby endpoint requires both latitude and longitude
    When I request nearby stations with only latitude 6.9271
    Then the response status should be 422

  Scenario: Nearby endpoint rejects a missing latitude
    When I request nearby stations with only longitude 79.8612
    Then the response status should be 422
