#version 330 core

#define MAX_STEPS 200
#define MAX_DIST 5000
#define SURF_DIST 0.01

#define N 1
#define LIGHT_COUNT 1
#define BH_index 0



//Камера и фон
uniform vec2 u_camRot; // вращение камеры (углы yaw, pitch)
uniform vec3 u_camPos; // позиция камеры
uniform vec2 u_resolution;
uniform sampler2D u_background;   // фоновое изображение

//Объекты
uniform vec4 u_BH;
uniform vec4 u_Object;
uniform float u_time;

// Параметры аккреционного диска
vec3 u_diskCenter = vec3(u_BH.x, u_BH.y, u_BH.z);       // центр диска
float u_diskRInner = 50;      // внутренний радиус (отверстие)
float u_diskROuter = 150;      // внешний радиус
float u_diskHalfHeight = 2;  // половина толщины по Y
vec3 BaseColor = vec3(0.99, 0.47, 0.01);

//Выход
out vec4 FragColor;





//-----------------------------------массивы объектов
//информация об  объекте
struct objInfo 
{
    float dist;
    vec3 color;
	bool isLight;
};

#if N > 0
	vec4 spheres[N] = vec4[](u_BH);

	vec3 sphereColor[N] = vec3[](vec3(0.0, 0.0, 0.0));
#endif

#if LIGHT_COUNT > 0
	vec4 lightSrc[LIGHT_COUNT] = vec4[](u_Object);

	vec3 lightColor[LIGHT_COUNT] = vec3[](vec3(1.0, 0.81, 0.28));
#endif



//----------------------------Смешивание цветов
vec3 toLinear(vec3 c) 
{
    return pow(c, vec3(2.2));
}

vec3 toGamma(vec3 c) 
{
    return pow(c, vec3(1.0 / 2.2));
}

vec3 mixColor(vec3 a, vec3 b, float t) 
{
    vec3 A = toLinear(a);
    vec3 B = toLinear(b);
    vec3 M = mix(A, B, t);
    return toGamma(M);
}


//-------------------------------Интерполированный шум--------------
// Исходный hash
float hash(vec3 p) 
{
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Трилинейная интерполяция для плавного шума
float noise(vec3 x) 
{
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), 
                       hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), 
                       hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), 
                       hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), 
                       hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

//В полярные координаты
vec3 toPolar(vec3 p, vec3 center) 
{
    vec3 dir = p - center;
    float r = length(dir.xz);
    float y = dir.y;
    float phi = atan(dir.z, dir.x);
    return vec3(r, y, phi);
}

vec4 getGlow(float minPDist) 
{
    float mainGlow = minPDist * 1.2;
    mainGlow = pow(mainGlow, 32.0);
    mainGlow = clamp(mainGlow, 0.0, 1.0);
    float outerGlow = minPDist * 0.4;
    outerGlow = pow(outerGlow, 2.0);
    outerGlow = clamp(outerGlow, 0.0, 1.0);
    vec4 glow = vec4(10, 5, 3, mainGlow);
    glow += vec4(0, 0, 0, outerGlow);
    glow.a = min(glow.a, 1.0);
    return glow;
}



//----------------------------------------Фон-------------------
vec3 getBackgroundColor(vec3 rayDir) 
{
    // Сферическая проекция rayDir в UV
    float u = atan(rayDir.z, rayDir.x) / (2.0 * 3.1415926) + 0.5;
    float v = rayDir.y * 0.5 + 0.5;
    return texture(u_background, vec2(u, v)).rgb;
}


//---------------------------------SDF для сферы------------------
float sphereSDF(vec3 p, vec4 sphere)
{
    return length(p - sphere.xyz) - sphere.w;
}


//---------------------------------SDF для диска
float sdAccretionDisk(vec3 p, vec3 center, float rInner, float rOuter, float halfHeight)
{
    vec3 q = p - center;
    float radialDist = length(q.xz);
    float dOuter = radialDist - rOuter;
    float dInner = rInner - radialDist;
    float dVertical = abs(q.y) - halfHeight;

    float ringDist = max(max(dOuter, dVertical), dInner);
	
	//Добавляем шум
	if(ringDist < 10.0)
    {
		vec3 c = toPolar(p, center);
        c *= 0.5;
		c.z = sin(8 * c.z + 0.5 * u_time);
		c.x *= 0.3;
		float n = noise(c);
        ringDist += n * 4;
        ringDist += noise(c * 5) * 0.4;
		BaseColor = mix(vec3(0.99, 0.47, 0.01), vec3(1.0, 1.0, 1.0), n);
    }
	
    return ringDist;
}


//------------------------матрица вращения вокруг оси Y
mat3 rotY(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(
        c, 0.0, -s,
        0.0, 1.0, 0.0,
        s, 0.0, c
    );
}


//--------------------------матрица вращения вокруг оси X
mat3 rotX(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat3(
        1.0, 0.0, 0.0,
        0.0, c, s,
        0.0, -s, c
    );
}


//--------------------------------------------сцена
objInfo map(vec3 p)
{
	objInfo obj;
	obj.dist = 1e9;
	obj.color = vec3(0.0);
	obj.isLight = false;
	
	int i;
	float d;
    for (i=0; i<N; i++)
    {
        d = sphereSDF(p, spheres[i]);
        if (d < obj.dist)
        {
            obj.dist = d;
            obj.color = sphereColor[i];
			obj.isLight = false;
        }
    }
	
	#if LIGHT_COUNT > 0
		for (i=0; i<LIGHT_COUNT; i++)
		{
			d = sphereSDF(p, lightSrc[i]);
			if (d < obj.dist)
			{
				obj.dist = d;
				
				//Текстура 
				// Основной цвет с вариацией по шуму
				vec3 base = lightColor[i]; // оттенок, который хотим сохранить
				float n = noise(p - lightSrc[i].xyz);
				n = clamp(n, 0.0, 1.0);
				obj.color = base * n + vec3(1.0) * (1.0 - n);
				
				obj.isLight = true;
			}
		}
	#endif
	
	// Добавим диск в сцену
	float dDisk = sdAccretionDisk(p, u_diskCenter, u_diskRInner, u_diskROuter, u_diskHalfHeight);
	if (dDisk < obj.dist)
	{
		obj.dist = dDisk;
		obj.color = BaseColor;
		obj.isLight = true;
	}

    return obj;
}



//---------------------------------------RayMarching
objInfo RayMarch(vec3 ro, vec3 rd) 
{
	objInfo obj;
	obj.dist = 0.0;
	obj.color = vec3(0.0);
	obj.isLight = false;
	
	vec3 color = vec3(1.0, 0.96, 0.85);
	vec3 glow = vec3(0.0);
    
	int i, ii;
	float dO = 0.0;
	float minDist = 1e9;
	vec3 p = ro;
    for(i=0; i<MAX_STEPS; i++) 
	{
		obj = map(p);
        float dS = obj.dist;
		if(dS<SURF_DIST) break;
		
		//Минимальное расстояние до источника света
		if(minDist > dS && obj.isLight==true) 
		{	
			//color = obj.color;
			minDist = dS;
		}
		
		// Искривление луча
		vec3 toAttractor = spheres[BH_index].xyz - p; //вектор к аттрактору
		vec3 DirtoAttractor = normalize(toAttractor); //направление на аттрактор
		float r = length(toAttractor); 
		//текущее направление + направление на аттрактор * множитель;
		float bendFactor = 10 * dS / pow(r + 1.0, 2.0);
		rd = normalize(mix(rd, DirtoAttractor, bendFactor));
		
		dO += dS;
		p = p + rd*dS;
		
		if(dO>MAX_DIST) //Цвет фона
		{
			glow = color * exp(-minDist * 0.2); //Вычисляем подсветку
			obj.color = mix(glow, getBackgroundColor(rd), 0.5);
			break;
		}
    }
	
	//Засветка диска
	// Направление на центр диска
	vec3 toDisk = normalize(u_diskCenter - ro);
	// Насколько камера направлена в сторону диска
	float alignment = max(dot(rd, toDisk), 0.0);
	// Геометрическая близость луча к диску
	float proximity = exp(-minDist * 2.0);
	// Интенсивность засветки — комбинация обоих факторов
	float glare = pow(alignment, 8.0) * proximity;
	// Тёплый белый цвет засветки
	vec3 glareColor = vec3(1.0, 0.96, 0.85) * glare * 2.5;
	// Добавляем эффект к итоговому цвету
	obj.color += glareColor;
	
	obj.dist = dO;
	
    return obj;
}





void main()
{
    // нормализуем координаты пикселя
	vec2 uv = (gl_FragCoord.xy-0.5*u_resolution.xy)/u_resolution.y;
	
	// положение камеры
	vec3 ro = u_camPos;

	// направление луча (локальные координаты камеры)
	vec3 rd = normalize(vec3(uv.x, uv.y, 1.0));

	// вращение камеры
	mat3 rot = rotY(u_camRot.x) * rotX(u_camRot.y);
	rd = rot * rd;
	
    objInfo obj = RayMarch(ro, rd);
    
    FragColor = vec4(obj.color, 1.0);
}