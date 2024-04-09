import mongoose from "mongoose";
import { User } from "../models/User.model";
import { ApiError } from "../util/ApiError";
import { asyncHandler } from "../util/asyncHandler";
import { generateAccessToken, generateRefreshToken } from "../util/generateTokens";
import { Request } from "express";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken";


const generateAccessAndRefreshToken = async (userId:mongoose.Types.ObjectId) => {
    try {
      const user= await User.findById(userId).select("-password");
      if(!user)
      throw new ApiError(400,"some error occurred while fetching user")
      const accessToken = await generateAccessToken(user._id,user.email||"",user.username||"",user.fullName||"");
      const refreshToken = await generateRefreshToken(user._id);
      
      user.refreshToken = refreshToken;
      user.accessToken = accessToken;
      await user.save({ validateBeforeSave: false });
  
      return {
        accessToken,
        refreshToken,
      };
    } catch (error) {
      throw new ApiError(
        500,
        "something went wrong while generating access and refresh token"
      );
    }
  };

const register = asyncHandler(async(req,res)=>{
    const {email,username,password,fullName} = req.body();
    if (
        [email, username, password].some((feild) => feild?.trim() === "")
      ) {
        throw new ApiError(400, "All feilds are required");
      }
    const existedUser = await User.findOne({ 
        $or :[{
            username,
            email
        }]})
    if(existedUser)
    throw new ApiError(409,"user already exist")

    const user = await User.create({
        email,
        username,
        password,
        fullName
    })
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
      );
    
      if (!createdUser) {
        throw new ApiError(500, "Soomething went wrong while registering the user");
    }
    return res
    .status(201)
    .json(new ApiResponse(200,createdUser,"User registered successfully"))

})

const login = asyncHandler(async(req,res)=>{
    const {email,password,username}  =req.body();
    if(!(email||username))
    {
        throw new ApiError(400,"email or username is required")

    }
    const user = await User.findOne({
        $or : [{email},{username}]
    });
    if(!user)
    throw new ApiError(400,"user doesnt exist")
    const isValidPassword =await bcrypt.compare(password, user?.password||"");
    

    if(!isValidPassword)
    throw new ApiError(400,"not a valid password")
    
    const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)

    const options ={
        httpOnly :true,
        secure :true
    }
    return res
    .status(200)
    .cookie("accessToken",accessToken)
    .cookie("refreshToken",refreshToken)
    .json(new ApiResponse(200,{accessToken,refreshToken},"user logged in successfully"))
})

const logout = asyncHandler(async(req:Request,res)=>{
    await User.findByIdAndUpdate(
        req.user?._id ,
        {
          $unset: {
            refreshToken: 1,
            accessToken :1,
          },
        },
        {
          new: true,
        }
      );
      return res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json(new ApiResponse(200, {}, "user logged out"));
})
const editUser = asyncHandler(async(req:Request,res)=>{
    const {username,fullName} = req.body();
    if(!(username||fullName))
    throw new ApiError(400,"username or password is required")

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
          $set: {
            fullName,
            username,
          },
        },
        { new: true }
      ).select("-password -accessToken -refreshToken");
      return res
        .status(200)
        .json(new ApiResponse(200, user ||{}, "Account details are updated"));
    });
    const changeCurrentPassword = asyncHandler(async (req, res) => {
      const { oldPassword, newPassword } = req.body;
      const user = await User.findById(req.user?._id).select("-accessToken -refreshToken");
      if(!user)
      throw new ApiError(400,"user does not exist")
      const isPasswordCorrect = await bcrypt.compare(oldPassword,user?.password||"")

      if (!isPasswordCorrect) 
      throw new ApiError(400, "Invalid old password");
      user.password = newPassword;
      await user.save({ validateBeforeSave: false });
      return res
        .status(200)
        .json(new ApiResponse(200, {}, "password changed successfully"));
    });
    const refreshAccessToken= asyncHandler(async(req,res)=>{
      try {
        const incomingRefreshToken =
          req.cookies.refreshToken || req.body.refreshToken;
        if (!incomingRefreshToken) {
          throw new ApiError(401, "unauthorized request");
        }
    
        const decodedToken = await jwt.verify(
          incomingRefreshToken,
          process.env.REFRESH_TOKEN_SECRET||""
        );
        if(typeof decodedToken==="string")
        throw new ApiError(401,"invalid token")
        const user = await User.findById(decodedToken?._id);
        if (!user) {
          throw new ApiError(401, "Invalid refresh token ");
        }
        if (incomingRefreshToken != user.refreshToken) {
          throw new ApiError(401, "refresh token is expired or used");
        }
        const options = {
          httpOnly: true,
          secure: true,
        };
        const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
          user._id
        );
    
        return res
          .status(200)
          .cookie("accessToken", accessToken, options)
          .cookie("refreshToken", refreshToken, options)
          .json(
            new ApiResponse(
              200,
              { accessToken, refreshToken },
              "access token refreshed"
            )
          );
      } catch (error:any) {
        throw new ApiError(401, error.message || "invalid token ");
      }
    })
export {login,
register,
logout,
editUser,
changeCurrentPassword,
refreshAccessToken

}