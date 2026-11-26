const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const weatherContainer = document.getElementById("weather-container");
const message = document.getElementById("message");

let cities = JSON.parse(
  localStorage.getItem("weatherCities") || "[]"
);

// Описание погодных условий
function getWeatherInfo(code) {
  const weather = {
    0: ["☀️", "Ясно"],
    1: ["🌤️", "Преимущественно ясно"],
    2: ["⛅", "Переменная облачность"],
    3: ["☁️", "Пасмурно"],
    45: ["🌫️", "Туман"],
    48: ["🌫️", "Изморозь"],
    51: ["🌦️", "Лёгкая морось"],
    53: ["🌦️", "Морось"],
    55: ["🌧️", "Сильная морось"],
    61: ["🌧️", "Небольшой дождь"],
    63: ["🌧️", "Дождь"],
    65: ["🌧️", "Сильный дождь"],
    71: ["🌨️", "Небольшой снег"],
    73: ["❄️", "Снег"],
    75: ["❄️", "Сильный снег"],
    80: ["🌦️", "Ливень"],
    81: ["🌧️", "Сильный ливень"],
    82: ["⛈️", "Очень сильный ливень"],
    95: ["⛈️", "Гроза"],
    96: ["⛈️", "Гроза с градом"],
    99: ["⛈️", "Сильная гроза"]
  };

  return weather[code] || ["🌡️", "Неизвестно"];
}

// Получаем координаты города
async function getCity(cityName) {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=ru&format=json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Ошибка поиска города");
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error("Город не найден");
  }

  // Берём первый результат поиска
  return data.results[0];
}

// Получаем погоду
async function getWeather(city) {
  const params = new URLSearchParams({
    latitude: city.latitude,
    longitude: city.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    forecast_days: "5",
    timezone: "auto"
  });

  const url =
    `https://api.open-meteo.com/v1/forecast?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Ошибка получения прогноза");
  }

  return await response.json();
}

// Сохраняем города
function saveCities() {
  localStorage.setItem(
    "weatherCities",
    JSON.stringify(cities)
  );
}

// Добавляем город
async function addCity(cityName) {
  message.textContent = "Загружаем прогноз...";

  try {
    const city = await getCity(cityName);

    const exists = cities.some(
      item =>
        item.latitude === city.latitude &&
        item.longitude === city.longitude
    );

    if (exists) {
      message.textContent = "Этот город уже добавлен";
      return;
    }

    const weather = await getWeather(city);

    cities.push({
      id: `${city.latitude}_${city.longitude}`,
      name: city.name,
      country: city.country || "",
      latitude: city.latitude,
      longitude: city.longitude,
      weather
    });

    saveCities();
    renderCities();

    message.textContent = "Город успешно добавлен!";

  } catch (error) {
    message.textContent = error.message;
  }
}

// Удаляем город
function removeCity(id) {
  cities = cities.filter(city => city.id !== id);
  saveCities();
  renderCities();
}

// Форматируем дату
function formatDate(date) {
  return new Date(date + "T12:00:00").toLocaleDateString(
    "ru-RU",
    { weekday: "short", day: "numeric", month: "short" }
  );
}

// Создаём карточки
function renderCities() {
  weatherContainer.innerHTML = "";

  if (cities.length === 0) {
    weatherContainer.innerHTML =
      '<p class="empty-state">Пока нет добавленных городов. Найди свой первый город!</p>';
    return;
  }

  cities.forEach(city => {
    const weather = city.weather;
    const current = weather.current;
    const daily = weather.daily;

    const [icon, description] =
      getWeatherInfo(current.weather_code);

    const card = document.createElement("article");
    card.className = "weather-card";

    const top = document.createElement("div");
    top.className = "card-top";

    const cityInfo = document.createElement("div");

    const cityTitle = document.createElement("div");
    cityTitle.className = "city-name";
    cityTitle.textContent = city.name;

    const country = document.createElement("div");
    country.className = "country";
    country.textContent = city.country;

    cityInfo.append(cityTitle, country);

    const removeButton = document.createElement("button");
    removeButton.className = "remove-btn";
    removeButton.textContent = "Удалить";
    removeButton.addEventListener("click", () => {
      removeCity(city.id);
    });

    top.append(cityInfo, removeButton);

    const currentWeather = document.createElement("div");
    currentWeather.className = "current-weather";

    const weatherIcon = document.createElement("div");
    weatherIcon.className = "weather-icon";
    weatherIcon.textContent = icon;

    const temperature = document.createElement("div");
    temperature.className = "temperature";
    temperature.textContent =
      `${Math.round(current.temperature_2m)}°`;

    const weatherDescription = document.createElement("div");
    weatherDescription.className = "weather-description";
    weatherDescription.textContent = description;

    currentWeather.append(
      weatherIcon,
      temperature,
      weatherDescription
    );

    const details = document.createElement("div");
    details.className = "weather-details";

    details.textContent =
      `💧 ${current.relative_humidity_2m}% влажность · ` +
      `🌬️ ${current.wind_speed_10m} км/ч · ` +
      `🌡️ Ощущается ${Math.round(current.apparent_temperature)}°`;

    const forecastTitle = document.createElement("h3");
    forecastTitle.className = "forecast-title";
    forecastTitle.textContent = "Прогноз на 5 дней";

    const forecast = document.createElement("div");

    for (let i = 0; i < 5; i++) {
      const [dayIcon, dayDescription] =
        getWeatherInfo(daily.weather_code[i]);

      const day = document.createElement("div");
      day.className = "forecast-day";

      const date = document.createElement("span");
      date.textContent = formatDate(daily.time[i]);

      const iconElement = document.createElement("span");
      iconElement.className = "forecast-icon";
      iconElement.textContent = dayIcon;
      iconElement.title = dayDescription;

      const rain = document.createElement("span");
      rain.textContent =
        `${daily.precipitation_sum[i]} мм`;

      const temp = document.createElement("span");
      temp.className = "forecast-temp";
      temp.textContent =
        `${Math.round(daily.temperature_2m_min[i])}° / ` +
        `${Math.round(daily.temperature_2m_max[i])}°`;

      day.append(date, iconElement, rain, temp);
      forecast.appendChild(day);
    }

    card.append(
      top,
      currentWeather,
      details,
      forecastTitle,
      forecast
    );

    weatherContainer.appendChild(card);
  });
}

// Обработка поиска
searchForm.addEventListener("submit", async event => {
  event.preventDefault();

  const cityName = cityInput.value.trim();

  if (!cityName) return;

  await addCity(cityName);

  cityInput.value = "";
});

// Обновление сохранённых городов
async function refreshCities() {
  const updatedCities = await Promise.all(
    cities.map(async city => {
      try {
        const weather = await getWeather(city);
        return { ...city, weather };
      } catch {
        return city;
      }
    })
  );

  cities = updatedCities;
  saveCities();
  renderCities();
}

// Запуск приложения
renderCities();
refreshCities();