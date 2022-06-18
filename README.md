# Strava Addon

Updates the description of Strava activities with split and weather info. Designed to be used with running type activities although there currently is no check in place to prevent other activities from being processed.


Description will be updated to the following format:

**SCHEMA**

```js
<original description>
[SPLITS]
distance    elapsed moving  pace
metres      MM:ss   MM:ss   "/km  "/mi
[WEATHER]
xx.x°F <condition>, feels like xx.x°F, Humidity xx.xx%, Wind xx.xmph from ↻ xx°NE w/ xx.xmph gusts, Clouds Cover xx.x%, UV Index x
```

**EXAMPLE**

```js
[SPLITS]
[00] 1609.34m > 9:21, 8:35 @ 5:21/km 8:36/mi
[01] 1609.34m > 21:48, 8:30 @ 5:16/km 8:29/mi
[02] 1609.34m > 8:57, 8:08 @ 5:03/km 8:08/mi
[03] 79.95m > 0:29, 0:24 @ 5:00/km 8:03/mi

[WEATHER]
73.1°F Partially cloudy, feels like 73.1°F, Humidity 29.71%, Wind 8.8mph from ↑ 354°N w/ 18.3mph gusts, Clouds Cover 41.5%, UV Index 4
```



<hr>



## Table of Contents

1. [Limitations](#limitations)
1. [Setup](#setup)
    1. [Requirements](#1-requirements)
    1. [Strava](#2-create-the-strava-app)
    1. [BigDataCloud](#3-get-reverse-geocoding-api-key)
    1. [VisualCrossing](#4-get-weather-api-key)
    1. [Cloning Repo](#5-clone-the-repo)
    1. [Editing *__settings.json__*](#6-edit-the-settingsjson-file)
    1. [Running](#7-running)
1. [Rate Limits](#rate-limits)



<hr>



## Limitations

Currently this is not a full proof application. For example, values within the *__settings.json__* file are not validated against invalid inputs. Not all errors are caught so fatal errors can occur if used improperly. There is currently no user friendly way to remove a user other than deleting the user's *__strava_oauth/\<id\>.json__*



<hr>



## Setup

### 1) Requirements

- Have [Node.JS](https://nodejs.org) installed on your computer.
- Install from the [Downloads](https://nodejs.org/en/download) page, or install using the proper package manager.

If you want to develop make sure NPM is also downloaded.



### 2) Create the Strava app

Visit Strava's [Getting Started](https://developers.strava.com/docs/getting-started) page to learn how to create your Strava app in [Section B](https://developers.strava.com/docs/getting-started/#account).

1. go to [*__My API Application__*](https://www.strava.com/settings/api)
1. Name your application
1. Choose any category
1. Set a website if you have one or use example.com
1. Set *__Authorization Callback Domain__* to **localhost**
1. Info on this page will be needed to update *__settings.json__*



### 3) Get reverse geocoding API key

1. Create an account with [Big Data Cloud](https://www.bigdatacloud.com)
1. Choose the free plan
1. Go to [Account](https://www.bigdatacloud.com/account) in upper right corner.
1. Create an API key if asked.
1. Take note of the "ApiKey"



### 4) Get weather API key

1. Create an account with [VisualCrossing](https://www.visualcrossing.com)
1. Choose the free tier when asked.
1. Then go to [Account](https://www.visualcrossing.com/account) in the upper right corner.
1. Take note of the "Key"



### 5) Clone the repo

```sh
~> git clone https://github.com/ifrog800/StravaAddon.git
~/StravaAddon> cd StravaAddon
```



### 6) Edit the *__settings.json__* file

Change the values to edit the application's configurable settings.
```js
{
    // the port the webserver will be running on
    "port": 4747,

    // CHANGE to your Strava app's Client ID
    "client_id": 11111,

    // CHANGE to your Strava app's Client Secret
    "client_secret": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",

    // the directory where data will be saved to, use any path Node.JS can resolve to
    "data_dir": "./.strava_addon_data",

    // store the data in compressed .json.gz format to save disk space
    // WARNING: If changed from true to false or vice versa, all cached data will need to be re-downloaded counting towards quotas/rate limits, change at own discretion
    "gzip_comp_data": true,

    // the string to look for so duplicate activity processing is not done
    "description_ending": "<<《Strava Addon》>>",

    // api keys, DO NOT SHARE!!!!!!!!
    "api": {

        // replace with the API Key found in step 2
        "bigdatacloud": "API_KEY_HERE",

        // replace with the API Key found in step 3
        "visualcrossing": "API_KEY_HERE"
    },

    // maps the VisualCrossing icon name to an emoji
    "weather_icons": {
        "clear-day": "☀️",
        "clear-night": "🌙",
        "cloudy": "☁️",
        "fog": "🌫️",
        "hail": "⚪",
        "partly-cloudy-day": "⛅",
        "partly-cloudy-night": "",
        "rain-snow-showers-day": "🌨️",
        "rain-snow-showers-night": "🌨️",
        "rain-snow": "🌨️",
        "rain": "🌧️",
        "showers-day": "🌧️",
        "showers-night": "🌧️",
        "snow": "❄️",
        "thunder-rain": "⛈️",
        "thunder-showers-day": "⛈️",
        "thunder-showers-night": "⛈️",
        "thunder": "⚡",
        "wind": "💨"
    }
}
```



### 7) Running

Open a terminal.

(**Command Prompt** or **Ctl + Alt + T**)

```sh
# change directory to where the git cloned repo is
~> cd StravaAddon

# run the application
~/StravaAddon> node src/server.js
```
Open a web browser and navigate to http://localhost:4747 to connect with your Strava

After connecting may need to restart application for it to work. Spam **Ctrl + C** until the program quits. Then press **↑** up arrow key and enter to restart.



<hr>



## Rate Limits

There are rate limits on the API's used within this application. There is no check to ensure the user is following rates. The program will error through any rate limited resources.

 - [Strava](https://developers.strava.com/docs/getting-started/#basic)
    - every 15 mins on the clock, limited to 100 API requests
    - every day limited to 1000 API requests

 - [BigCloudData (Base)](https://www.bigdatacloud.com/packages/reverse-geocoding)
    - 50k reverse geo-code queries per month

 - [VisualCrossing (Free)](https://www.visualcrossing.com/weather-data-editions)
    - 1000 credits per day
    - each historical lookup is 24 credits
    - so only 1000/24 = 41 lookups a day



<hr>



[Back to Top](#strava-addon)