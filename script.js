const {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
} = window.WEATHER_APP_CONFIG || {};

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const weatherContainer = document.getElementById("weather-container");
const message = document.getElementById("message");
const suggestions = document.getElementById("suggestions");
const themeToggle = document.getElementById("theme-toggle");

let supabaseClient;
let currentUser = null;
let cities = [];
let searchResults = [];
let searchTimer;
let searchController;

function setMessage(text) {
  message.textContent = text;
}

// Theme: stored locally in this browser.
function applyTheme(theme) {
  document.body.classList.toggle("dark-theme", theme === "dark");
  themeToggle.textContent = theme === "dark" ? "Светлая тема" : "Тёмная тема";
  localStorage.setItem("weatherTheme", theme);
  document.querySelector('meta[name="theme-color"]')
    .setAttribute("content", theme === "dark" ? "#15171b" : "#ffffff");
}

applyTheme(localStorage.getItem("weatherTheme") || "light");

themeToggle.addEventListener("click", () => {
  applyTheme(document.body.classList.contains("dark-theme") ? "light" : "dark");
});

// Weather descriptions from Open-Meteo WMO weather codes.
function getWeatherInfo(code) {
  const labels = {
    0: "Ясно",
    1: "Преимущественно ясно",
    2: "Переменная облачность",
    3: "Пасмурно",
    45: "Туман",
    48: "Изморозь",
    51: "Лёгкая морось",
    53: "Морось",
    55: "Сильная морось",
    61: "Небольшой дождь",
    63: "Дождь",
    65: "Сильный дождь",
    71: "Небольшой снег",
    73: "Снег",
    75: "Сильный снег",
    80: "Ливень",
    81: "Сильный ливень",
    82: "Очень сильный ливень",
    95: "Гроза",
    96: "Гроза с градом",
    99: "Сильная гроза"
  };
  return labels[code] || "Неизвестные условия";
}

function showError(context, error) {
  console.error(context, error);
  setMessage(`${context}: ${error.message || "неизвестная ошибка"}`);
}

// Supabase anonymous session. The Supabase SDK persists the session in this browser.
async function initializeSupabase() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY ||
      SUPABASE_URL.includes("ВСТАВЬТЕ") ||
      SUPABASE_PUBLISHABLE_KEY.includes("ВСТАВЬТЕ")) {
    throw new Error("Сначала укажи URL и publishable key в config.js");
  }

  if (!window.supabase?.createClient) {
    throw new Error("Не удалось загрузить библиотеку Supabase");
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError) throw sessionError;

  if (sessionData.session) {
    currentUser = sessionData.session.user;
  } else {
    const { data, error } = await supabaseClient.auth.signInAnonymously();
    if (error) throw error;
    currentUser = data.user;
  }

  if (!currentUser) {
    throw new Error("Не удалось создать анонимную сессию");
  }
}

// Read only this browser's rows. RLS also enforces ownership on the database.
async function loadCities() {
  const { data, error } = await supabaseClient
    .from("saved_cities")
    .select("id, name, country, latitude, longitude, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;

  cities = (data || []).map(row => ({
    ...row,
    weather: null
  }));

  renderCities();
  await refreshCitiesWeather();
}

// Insert a city into Supabase. user_id is assigned by the database default auth.uid().
async function addCity(city) {
  const duplicate = cities.some(item =>
    Number(item.latitude) === Number(city.latitude) &&
    Number(item.longitude) === Number(city.longitude)
  );

  if (duplicate) {
    setMessage("Этот город уже добавлен");
    return;
  }

  setMessage("Сохранение города…");

  const { data, error } = await supabaseClient
    .from("saved_cities")
    .insert({
      name: city.name,
      country: city.country || "",
      latitude: city.latitude,
      longitude: city.longitude
    })
    .select("id, name, country, latitude, longitude, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      setMessage("Этот город уже добавлен");
      return;
    }
    throw error;
  }

  cities.push({ ...data, weather: null });
  renderCities();
  setMessage("Город сохранён в базе данных");

  try {
    const weather = await getWeather(data);
    const item = cities.find(c => c.id === data.id);
    if (item) item.weather = weather;
    renderCities();
  } catch (error) {
    showError("Город сохранён, но погоду загрузить не удалось", error);
  }
}

// Delete only the selected row belonging to the current authenticated user.
async function removeCity(id) {
  setMessage("Удаление города…");

  const { error } = await supabaseClient
    .from("saved_cities")
    .delete()
    .eq("id", id);

  if (error) {
    showError("Не удалось удалить город", error);
    return;
  }

  cities = cities.filter(city => city.id !== id);
  renderCities();
  setMessage("Город удалён из базы данных");
}

// City search via Open-Meteo Geocoding API.
async function searchCities(query) {
  if (searchController) searchController.abort();
  searchController = new AbortController();

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: query,
    count: "7",
    language: "ru",
    format: "json"
  });

  const response = await fetch(url, { signal: searchController.signal });
  if (!response.ok) throw new Error("Ошибка поиска города");

  const data = await response.json();
  return data.results || [];
}

function showSuggestions(results) {
  suggestions.replaceChildren();
  searchResults = results;

  if (!results.length) {
    suggestions.classList.remove("visible");
    return;
  }

  results.forEach((city, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.setAttribute("role", "option");

    const name = document.createElement("strong");
    name.textContent = city.name;

    const details = document.createElement("small");
    details.textContent = [city.admin1, city.country]
      .filter(Boolean).join(", ");

    button.append(name, details);
    button.addEventListener("click", () => selectCity(index));
    suggestions.appendChild(button);
  });

  suggestions.classList.add("visible");
}

async function selectCity(index) {
  const city = searchResults[index];
  if (!city) return;

  suggestions.classList.remove("visible");
  searchResults = [];
  cityInput.value = "";

  try {
    await addCity(city);
  } catch (error) {
    showError("Не удалось сохранить город", error);
  }
}

async function getWeather(city) {
  const params = new URLSearchParams({
    latitude: city.latitude,
    longitude: city.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    forecast_days: "5",
    timezone: "auto"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Ошибка получения прогноза");
  return response.json();
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function renderCities() {
  weatherContainer.replaceChildren();

  if (!cities.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Пока нет сохранённых городов. Найди город выше.";
    weatherContainer.appendChild(empty);
    return;
  }

  cities.forEach(city => {
    const card = document.createElement("article");
    card.className = "weather-card";

    const top = document.createElement("div");
    top.className = "card-top";

    const cityInfo = document.createElement("div");
    const title = document.createElement("div");
    title.className = "city-name";
    title.textContent = city.name;

    const country = document.createElement("div");
    country.className = "country";
    country.textContent = city.country || "";

    cityInfo.append(title, country);

    const removeButton = document.createElement("button");
    removeButton.className = "remove-btn";
    removeButton.type = "button";
    removeButton.textContent = "Удалить";
    removeButton.addEventListener("click", () => removeCity(city.id));

    top.append(cityInfo, removeButton);
    card.appendChild(top);

    if (!city.weather) {
      const loading = document.createElement("p");
      loading.className = "empty-state";
      loading.textContent = "Загрузка прогноза…";
      loading.style.marginTop = "24px";
      card.appendChild(loading);
      weatherContainer.appendChild(card);
      return;
    }

    const current = city.weather.current;
    const daily = city.weather.daily;

    const currentBlock = document.createElement("div");
    currentBlock.className = "current-weather";

    const temperature = document.createElement("div");
    temperature.className = "temperature";
    temperature.textContent = `${Math.round(current.temperature_2m)}°`;

    const description = document.createElement("div");
    description.className = "weather-description";
    description.textContent = getWeatherInfo(current.weather_code);

    currentBlock.append(temperature, description);

    const details = document.createElement("div");
    details.className = "weather-details";

    [
      `Влажность: ${current.relative_humidity_2m}%`,
      `Ветер: ${current.wind_speed_10m} км/ч`,
      `Ощущается: ${Math.round(current.apparent_temperature)}°`
    ].forEach(text => {
      const span = document.createElement("span");
      span.textContent = text;
      details.appendChild(span);
    });

    const forecastTitle = document.createElement("h3");
    forecastTitle.className = "forecast-title";
    forecastTitle.textContent = "Прогноз на 5 дней";

    const forecast = document.createElement("div");

    for (let i = 0; i < 5; i++) {
      const day = document.createElement("div");
      day.className = "forecast-day";

      const date = document.createElement("span");
      date.textContent = formatDate(daily.time[i]);

      const description = document.createElement("span");
      description.className = "forecast-description";
      description.textContent = getWeatherInfo(daily.weather_code[i]);

      const temp = document.createElement("span");
      temp.className = "forecast-temp";
      temp.textContent =
        `${Math.round(daily.temperature_2m_min[i])}° / ${Math.round(daily.temperature_2m_max[i])}°`;

      day.append(date, description, temp);
      forecast.appendChild(day);
    }

    card.append(currentBlock, details, forecastTitle, forecast);
    weatherContainer.appendChild(card);
  });
}

async function refreshCitiesWeather() {
  await Promise.all(cities.map(async city => {
    try {
      city.weather = await getWeather(city);
    } catch (error) {
      console.error(`Weather request failed for ${city.name}`, error);
    }
  }));
  renderCities();
}

cityInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = cityInput.value.trim();

  if (query.length < 2) {
    if (searchController) searchController.abort();
    searchResults = [];
    suggestions.classList.remove("visible");
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      setMessage("Поиск городов…");
      const results = await searchCities(query);

      // Ignore results for an older query.
      if (cityInput.value.trim() !== query) return;

      showSuggestions(results);
      setMessage(results.length
        ? `Найдено результатов: ${results.length}`
        : "Города не найдены");
    } catch (error) {
      if (error.name !== "AbortError") showError("Ошибка поиска", error);
    }
  }, 350);
});

searchForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (searchResults.length) {
    await selectCity(0);
  } else {
    setMessage("Введи минимум две буквы и выбери город из списка");
  }
});

document.addEventListener("click", event => {
  if (!event.target.closest(".search-section")) {
    suggestions.classList.remove("visible");
  }
});

async function startApp() {
  try {
    setMessage("Подключение к Supabase…");
    await initializeSupabase();
    setMessage("Загрузка твоих городов…");
    await loadCities();
    setMessage("Данные синхронизированы с базой Supabase");
  } catch (error) {
    showError("Не удалось запустить приложение", error);
    weatherContainer.replaceChildren();
    const help = document.createElement("p");
    help.className = "empty-state";
    help.textContent = "Проверь config.js, настройки Supabase Auth и SQL из папки database.";
    weatherContainer.appendChild(help);
  }
}

startApp();
