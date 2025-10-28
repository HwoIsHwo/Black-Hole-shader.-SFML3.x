#version 330 core

#define MAX_STEPS 200
#define MAX_DIST 5000
#define SURF_DIST 0.001

#define N 2
#define LIGHT_COUNT 0
#define BH_index 0



//Камера и фон
uniform vec2 u_camRot; // вращение камеры (углы yaw, pitch)
uniform vec3 u_camPos; // позиция камеры
uniform vec2 u_resolution;
uniform sampler2D u_background;   // фоновое изображение
//Объекты
uniform vec4 u_BH;
uniform vec4 u_Object;

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
	vec4 spheres[N] = vec4[](u_BH, u_Object);

	vec3 sphereColor[N] = vec3[](vec3(0.0, 0.0, 0.0),
								vec3(1.0, 0.81, 0.28));
#endif

#if LIGHT_COUNT > 0
	vec4 lightSrc[LIGHT_COUNT] = vec4[](
									vec4(0.0, 0.0, 10, 5));

	vec3 lightColor[LIGHT_COUNT] = vec3[](
									vec3(1.0, 0.81, 0.28));
#endif





//----------------------------------------Фон
vec3 getBackgroundColor(vec3 rayDir) 
{
    // Сферическая проекция rayDir в UV
    float u = atan(rayDir.z, rayDir.x) / (2.0 * 3.1415926) + 0.5;
    float v = rayDir.y * 0.5 + 0.5;
    return texture(u_background, vec2(u, v)).rgb;
}


//---------------------------------функция расстояния до сферы
float sphereSDF(vec3 p, vec4 sphere)
{
    return length(p - sphere.xyz) - sphere.w;
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
				obj.color = lightColor[i];
				obj.isLight = true;
			}
		}
	#endif

    return obj;
}



//---------------------------------------RayMarching
objInfo RayMarch(vec3 ro, vec3 rd) 
{
	objInfo obj;
	obj.dist = 0.0;
	obj.color = vec3(0.0);
	obj.isLight = false;
	
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
		
		#if LIGHT_COUNT > 0
		//Минимальное расстояние до источника света
			float lightDist = length(p - lightSrc[0].xyz) - lightSrc[0].w;
			if(minDist > lightDist) minDist = lightDist;
		#endif
		
		// Искривление луча
		vec3 toAttractor = spheres[BH_index].xyz - p; //вектор к аттрактору
		vec3 DirtoAttractor = normalize(toAttractor); //направление на аттрактор
		float r = length(toAttractor); 
		//текущее направление + направление на аттрактор * множитель;
		rd = rd + 10 * DirtoAttractor * dS / (r * r);
		rd = normalize(rd);
		
		dO += dS;
		p = p + rd*dS;
		
		if(dO>MAX_DIST) //Цвет фона
		{
			vec3 color = vec3(0.0);
			
			#if LIGHT_COUNT > 0
				color = lightColor[0];
			#endif
			
			glow = 0.5 * color / (minDist * minDist); //Вычисляем подсветку
			obj.color = glow/2 + getBackgroundColor(rd) / 2;
			break;
		}
    }
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
	
	vec3 col = vec3(0.0);
    objInfo obj = RayMarch(ro, rd);
	col = obj.color;
    
    FragColor = vec4(col, 1.0);
}