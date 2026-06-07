from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.usuario import UsuarioAdmin
from app.core.security import SECRET_KEY, ALGORITHM

# Le decimos a FastAPI dónde está la ruta para obtener el token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# Conexión a la base de datos
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# Este es nuestro "Guardia de Seguridad"
async def obtener_usuario_actual(
    token: str = Depends(oauth2_scheme), 
    db: AsyncSession = Depends(get_db)
):
    credenciales_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales o el token expiró",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # 1. Desencriptamos el Token
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credenciales_exception
    except JWTError:
        raise credenciales_exception
    
    # 2. Verificamos que el usuario siga existiendo en la base de datos
    stmt = select(UsuarioAdmin).filter(UsuarioAdmin.username == username)
    resultado = await db.execute(stmt)
    user = resultado.scalars().first()
    
    if user is None:
        raise credenciales_exception
        
    # 3. Si todo está bien, dejamos pasar la petición
    return user