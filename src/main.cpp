#define STB_IMAGE_IMPLEMENTATION

#include "stb_image.h"
#include <SFML/Graphics.hpp>
#include <cmath>
#include <vector>
#include <algorithm>
#include <cstdint>




//--------------------Вспомогательные функции для работы с векторами--------------
float length(const sf::Vector3f& v)
{
    return std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}


sf::Vector3f normalize(const sf::Vector3f& v)
{
    float len = length(v);
    if (len == 0.f) return sf::Vector3f(0.f, 0.f, 0.f);
    return v / len;
}
//-------------------------------------------------------------------------------



//----------------------------------Загрузка HDR изображения------------------
sf::Texture loadHDR(const std::string& filename)
{
    int w, h, n;
    float* data = stbi_loadf(filename.c_str(), &w, &h, &n, 3);
    if (!data)
        throw std::runtime_error(std::string("Can't load HDR file: ") + stbi_failure_reason());

    std::vector<std::uint8_t> buffer(w * h * 4);

    // Тонмаппинг с гаммой 2.2
    for (int i = 0; i < w * h; ++i) {
        float r = powf(data[i * 3 + 0], 1.0f / 2.2f);
        float g = powf(data[i * 3 + 1], 1.0f / 2.2f);
        float b = powf(data[i * 3 + 2], 1.0f / 2.2f);

        buffer[i * 4 + 0] = static_cast<std::uint8_t>(std::clamp(r * 255.0f, 0.0f, 255.0f));
        buffer[i * 4 + 1] = static_cast<std::uint8_t>(std::clamp(g * 255.0f, 0.0f, 255.0f));
        buffer[i * 4 + 2] = static_cast<std::uint8_t>(std::clamp(b * 255.0f, 0.0f, 255.0f));
        buffer[i * 4 + 3] = 255;
    }

    stbi_image_free(data);

    // ? В SFML 3 Image создаётся напрямую из размеров и данных
    sf::Vector2u size(static_cast<unsigned>(w), static_cast<unsigned>(h));
    sf::Image image(size, buffer.data());

    sf::Texture tex;
    if (!tex.loadFromImage(image)) {
        throw std::runtime_error("Failed to create texture from HDR image");
    }

    return tex;
}
//-------------------------------------------------------------



//-----------------------------Функция отображения FPS---------------------------
void drawFPS(sf::RenderWindow& window, sf::Clock& clock, sf::Font& font)
{
    static sf::Text fpsText(font, "", 10); // шрифт обязателен в конструкторе
    static float elapsedTime = 0.f;
    static int frameCount = 0;
    static float fps = 0.f;

    // Расчёт времени кадра
    float dt = clock.restart().asSeconds();
    elapsedTime += dt;
    frameCount++;

    // Обновляем FPS каждые ~1 секунду
    if (elapsedTime >= 1.0f)
    {
        fps = frameCount / elapsedTime;
        elapsedTime = 0.f;
        frameCount = 0;
    }

    // Обновление текста
    std::stringstream ss;
    ss << "FPS: " << static_cast<int>(fps);
    fpsText.setString(ss.str());
    fpsText.setFillColor(sf::Color::White);
    fpsText.setPosition(sf::Vector2f(10.f, 10.f));

    // Рисуем на экран
    window.draw(fpsText);
}
//-----------------------------------------------------------------------------





int main()
{
//-----------------------------------Настройки окна----------------------
    unsigned int screen_w = 1920;
    unsigned int screen_h = 1080;

    sf::ContextSettings settings;
    settings.antiAliasingLevel = 1;
    sf::RenderWindow window(sf::VideoMode({screen_w, screen_h}),
							"Test",
							sf::State::Fullscreen,
							settings);

    // Создаем полноэкранный квадрат
    sf::RectangleShape quad(sf::Vector2f(screen_w, screen_h));
    quad.setPosition(sf::Vector2f(0, 0));
	
	//окно FPS
	sf::Clock clock1, clock2, clock3; //часы для физики, фпс,камеры и тд
	sf::Font font;
	if (!font.openFromFile("res\\fonts\\arial.ttf"));
	

    // Загружаем фрагментный шейдер
    sf::Shader shader;
    if (!shader.loadFromFile("res\\shaders\\fragmentShader.frag", sf::Shader::Type::Fragment))
    {
        return -1; // ошибка при загрузке шейдера
    }
    // Передаем размер экрана в шейдер
    shader.setUniform("u_resolution", sf::Glsl::Vec2(screen_w, screen_h));
//-------------------------------------------------------------------------
	
	
//-------------------------------Управление камерой---------------------
    sf::Vector3f camPos(0.0f, 1.0f, -50.0f);
    float yaw = 0.0f;   // вращение по Y
    float pitch = 0.0f; // вращение по X
    const float mouseSensitivity = 0.002f;
    const float moveSpeed = 5.0f;
	const float SpeedMult = 10.0f;
	float k;
	
	// Скрываем курсор и ставим его в центр
    window.setMouseCursorGrabbed(true);
    window.setMouseCursorVisible(false);
    sf::Vector2i center = {(int)screen_w / 2, (int)screen_h / 2};
    sf::Mouse::setPosition(center, window);
//-----------------------------------------------------------------


//------------------------------------Изображение фона---------------
	sf::Texture background;
	background = loadHDR("res//img//BackGround.hdr");  // <- новый вызов

	background.setRepeated(true);
	background.setSmooth(true);
	//передаем фон в шейдер
	shader.setUniform("u_background", background);
//-------------------------------------------------------------------


//---------------------------------Координаты объектов-------------
	sf::Vector3f BHPos(300.0f, 0.0f, 0.0f); //координаты черной дыры
	float BHRadius = 0.1f; //радиус центра ЧД
	sf::Vector3f MetaballPos(0.0f, 0.0f, 0.0f); //координаты сферы
	float MetaballRadius = 5.0f; //радиус сферы
	sf::Vector3f MetabollSpeed(0.0f, 0.2f, 0.7f); //начальная скорость сферы
	//передача в шейдер
	shader.setUniform("u_BH", 
						sf::Glsl::Vec4(BHPos.x, BHPos.y, BHPos.z, BHRadius));
//-----------------------------------------------------------------


//-------------------------------Основной цикл--------------------
    while (window.isOpen())
    {
        while (const std::optional event = window.pollEvent())
        {
            if (event->is<sf::Event::Closed>())
			{
                window.close();
			}
        }
		
		//---------------------------------управление камерой----------------------
		float dt = clock3.restart().asSeconds();
        sf::Vector2i mousePos = sf::Mouse::getPosition(window);
        sf::Vector2i delta = mousePos - center;
        sf::Mouse::setPosition(center, window);

        yaw   += delta.x * mouseSensitivity;
        pitch += delta.y * mouseSensitivity;
		
        // Ограничение угла взгляда
        const float limit = 1.5f;
        if (pitch > limit) pitch = limit;
        if (pitch < -limit) pitch = -limit;
		
		// Векторы направления относительно углов камеры
		sf::Vector3f forward(
			std::sin(yaw) * std::cos(pitch),
			-std::sin(pitch),
			std::cos(yaw) * std::cos(pitch)
		);
		sf::Vector3f right(
			std::cos(yaw),
			0.0f,
			-std::sin(yaw)
		);
				
		//Перемещение
		if(sf::Keyboard::isKeyPressed(sf::Keyboard::Key::LShift ))
			k = SpeedMult;
		else
			k = 1;
		if(sf::Keyboard::isKeyPressed(sf::Keyboard::Key::W))
            camPos += k * forward * moveSpeed * dt;
        if(sf::Keyboard::isKeyPressed(sf::Keyboard::Key::S))
            camPos -= k * forward * moveSpeed * dt;
        if(sf::Keyboard::isKeyPressed(sf::Keyboard::Key::D))
            camPos += k * right * moveSpeed * dt;
        if(sf::Keyboard::isKeyPressed(sf::Keyboard::Key::A))
            camPos -= k * right * moveSpeed * dt;

		shader.setUniform("u_camPos", sf::Glsl::Vec3(camPos.x, camPos.y, camPos.z));
        shader.setUniform("u_camRot", sf::Glsl::Vec2(yaw, pitch));
		//---------------------------------------------------------------------------
		
		//-----------------------------------Физика-----------------------------------
		sf::Vector3f toBH = BHPos - MetaballPos;
		float distToAttractor = length(toBH);
		toBH = 50.0f * normalize(toBH) / (distToAttractor * distToAttractor);
		MetabollSpeed = toBH + MetabollSpeed;
		MetaballPos += MetabollSpeed * dt;
						
		shader.setUniform("u_Object", 
							sf::Glsl::Vec4(MetaballPos.x, MetaballPos.y, 
											MetaballPos.z, MetaballRadius));
		
		float time = clock1.getElapsedTime().asSeconds();
        shader.setUniform("u_time", time);
		//-----------------------------------------------------------------------------

		//отрисовка
        window.clear();
        window.draw(quad, &shader);
		drawFPS(window, clock2, font);
        window.display();
    }
}